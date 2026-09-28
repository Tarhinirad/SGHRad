import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  PGY_YEARS,
  ScheduleEngine,
  academicYearMonths,
  academicYearStartFor,
  firstOfMonth,
  isValidISO,
  lastOfMonth,
  type Resident,
  type Rotation,
  type Settings,
} from '../../shared/src/index';
import { authConfig, login, requireAdmin, requireAuth, signToken } from './auth';
import * as repo from './db';
import { buildWorkbook, parseWorkbook } from './excel';
import { applyImport, summarizeImport, type ImportMode } from './importer';

type DB = repo.DB;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const bad = (msg: string) => new HttpError(400, msg);

function str(v: unknown, field: string, { optional = false } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (optional) return '';
    throw bad(`${field} is required`);
  }
  if (typeof v !== 'string') throw bad(`${field} must be a string`);
  return v.trim();
}

function date(v: unknown, field: string): string {
  if (!isValidISO(v)) throw bad(`${field} must be a date (YYYY-MM-DD)`);
  return v;
}

const wrap =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

export function today(): string {
  // Date in the hospital's time zone (Beirut) so "today" flips at local midnight.
  const tz = process.env.TZ_NAME ?? 'Asia/Beirut';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function createApp(db: DB, opts: { onChange?: () => void } = {}) {
  const app = express();
  const cfg = authConfig(db);
  app.use(express.json({ limit: '5mb' }));
  // Tell the persistence layer (if any) after every successful write request.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && opts.onChange) res.on('finish', () => res.statusCode < 400 && opts.onChange!());
    next();
  });

  const user = (req: Request) => req.session?.name ?? 'unknown';
  const engine = () => new ScheduleEngine(repo.loadScheduleData(db));
  const yearRange = (yearStartParam: unknown) => {
    const s = repo.getSettings(db);
    const ys =
      typeof yearStartParam === 'string' && /^\d{4}$/.test(yearStartParam)
        ? `${yearStartParam}-${String(s.academicYearStartMonth).padStart(2, '0')}`
        : academicYearStartFor(today(), s.academicYearStartMonth);
    const months = academicYearMonths(ys);
    return { yearStart: ys, months, from: firstOfMonth(months[0]), to: lastOfMonth(months[11]) };
  };

  // ------------------------------------------------------------------ public
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post(
    '/api/login',
    wrap((req, res) => {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 60) : '';
      const s = login(cfg, password, name);
      if (!s) throw new HttpError(401, 'Wrong password');
      if (s.role === 'admin') repo.audit(db, s.name, 'login', 'session', { role: s.role });
      res.json({ token: signToken(cfg.secret, s), role: s.role, name: s.name });
    }),
  );

  // ------------------------------------------------------------------ authenticated
  app.use('/api', requireAuth(cfg.secret));

  app.get('/api/me', (req, res) => res.json({ role: req.session!.role, name: req.session!.name, today: today() }));

  app.get('/api/data', (_req, res) => {
    res.json({ ...repo.loadScheduleData(db), today: today() });
  });

  app.get(
    '/api/schedule',
    wrap((req, res) => {
      const from = date(req.query.from, 'from');
      const to = date(req.query.to ?? req.query.from, 'to');
      if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw bad('Invalid range');
      res.json(engine().range(from, to));
    }),
  );

  app.get(
    '/api/issues',
    wrap((req, res) => {
      let { from, to } = yearRange(req.query.year);
      if (req.query.from) from = date(req.query.from, 'from');
      if (req.query.to) to = date(req.query.to, 'to');
      res.json({ from, to, issues: engine().issues(from, to) });
    }),
  );

  app.get('/api/audit', (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json(repo.getAudit(db, limit, offset));
  });

  app.get(
    '/api/export',
    wrap(async (req, res) => {
      const { yearStart, months } = yearRange(req.query.year);
      const blank = req.query.blank === '1';
      const data = repo.loadScheduleData(db);
      const wb = await buildWorkbook(blank ? { ...data, residents: [], monthly: {}, vacations: [], calls: {} } : data, yearStart);
      const name = `SGUMC_Radiology_${blank ? 'Template' : 'Schedule'}_${months[0].slice(0, 4)}-${months[11].slice(0, 4)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      const buf = await wb.xlsx.writeBuffer();
      res.send(Buffer.from(buf as ArrayBuffer));
    }),
  );

  // ------------------------------------------------------------------ admin only
  app.use('/api', (req, res, next) => (req.method === 'GET' ? next() : requireAdmin(req, res, next)));

  // Residents
  const parseResident = (body: any, id?: string): Resident => {
    const year = str(body?.year, 'year');
    if (!(PGY_YEARS as readonly string[]).includes(year)) throw bad(`year must be one of ${PGY_YEARS.join(', ')}`);
    return {
      id: id ?? str(body?.id, 'id'),
      name: str(body?.name, 'name'),
      phone: str(body?.phone, 'phone', { optional: true }),
      year: year as Resident['year'],
      active: body?.active !== false,
    };
  };

  app.post(
    '/api/residents',
    wrap((req, res) => {
      const r = parseResident(req.body);
      if (repo.getResidents(db).some((x) => x.id === r.id)) throw bad(`ResidentID ${r.id} already exists`);
      repo.upsertResident(db, r);
      repo.audit(db, user(req), 'create', 'resident', r);
      res.json(r);
    }),
  );

  app.put(
    '/api/residents/:id',
    wrap((req, res) => {
      const before = repo.getResidents(db).find((x) => x.id === req.params.id);
      if (!before) throw new HttpError(404, 'Resident not found');
      const r = parseResident({ ...before, ...req.body }, before.id);
      repo.upsertResident(db, r);
      repo.audit(db, user(req), 'update', 'resident', { id: r.id, before, after: r });
      res.json(r);
    }),
  );

  // Monthly schedule cell
  app.put(
    '/api/monthly',
    wrap((req, res) => {
      const residentId = str(req.body?.residentId, 'residentId');
      const month = str(req.body?.month, 'month');
      if (!/^\d{4}-\d{2}$/.test(month)) throw bad('month must be YYYY-MM');
      const value = str(req.body?.value, 'value', { optional: true });
      if (value && !repo.getRotations(db).some((r) => r.name === value)) throw bad(`Unknown rotation "${value}"`);
      const before = repo.getMonthly(db)[residentId]?.[month] ?? '';
      repo.setMonthly(db, residentId, month, value || null);
      repo.audit(db, user(req), 'update', 'monthly', { residentId, month, before, after: value });
      res.json({ ok: true });
    }),
  );

  // Daily calls
  app.put(
    '/api/calls/:date',
    wrap((req, res) => {
      const d = date(req.params.date, 'date');
      const residentId = str(req.body?.residentId, 'residentId', { optional: true });
      if (residentId && !repo.getResidents(db).some((r) => r.id === residentId)) throw bad('Unknown resident');
      const before = repo.getCalls(db)[d] ?? '';
      repo.setCall(db, d, residentId || null);
      repo.audit(db, user(req), 'update', 'call', { date: d, before, after: residentId });
      res.json({ ok: true });
    }),
  );

  // Vacations
  const parseVacation = (body: any) => {
    const residentId = str(body?.residentId, 'residentId');
    if (!repo.getResidents(db).some((r) => r.id === residentId)) throw bad('Unknown resident');
    const start = date(body?.start, 'start');
    const end = date(body?.end, 'end');
    if (end < start) throw bad('End date is before start date');
    return { residentId, start, end, notes: str(body?.notes, 'notes', { optional: true }) };
  };

  app.post(
    '/api/vacations',
    wrap((req, res) => {
      const v = parseVacation(req.body);
      const id = repo.insertVacation(db, v);
      repo.audit(db, user(req), 'create', 'vacation', { id, ...v });
      res.json({ id, ...v });
    }),
  );

  app.put(
    '/api/vacations/:id',
    wrap((req, res) => {
      const id = Number(req.params.id);
      const before = repo.getVacations(db).find((v) => v.id === id);
      if (!before) throw new HttpError(404, 'Vacation not found');
      const v = parseVacation({ ...before, ...req.body });
      db.prepare('UPDATE vacations SET resident_id = ?, start = ?, end = ?, notes = ? WHERE id = ?').run(v.residentId, v.start, v.end, v.notes, id);
      repo.audit(db, user(req), 'update', 'vacation', { id, before, after: v });
      res.json({ id, ...v });
    }),
  );

  app.delete(
    '/api/vacations/:id',
    wrap((req, res) => {
      const id = Number(req.params.id);
      const before = repo.getVacations(db).find((v) => v.id === id);
      if (!before) throw new HttpError(404, 'Vacation not found');
      db.prepare('DELETE FROM vacations WHERE id = ?').run(id);
      repo.audit(db, user(req), 'delete', 'vacation', before);
      res.json({ ok: true });
    }),
  );

  // Per-day resolutions
  app.put(
    '/api/cover-choice/:date',
    wrap((req, res) => {
      const d = date(req.params.date, 'date');
      const residentId = str(req.body?.residentId, 'residentId', { optional: true });
      repo.setCoverChoice(db, d, residentId || null);
      repo.audit(db, user(req), 'update', 'cover-choice', { date: d, covered: residentId });
      res.json({ ok: true });
    }),
  );

  app.put(
    '/api/overrides/:date/:residentId',
    wrap((req, res) => {
      const d = date(req.params.date, 'date');
      const residentId = req.params.residentId;
      const assignment = str(req.body?.assignment, 'assignment', { optional: true });
      if (assignment && assignment !== 'Off' && !repo.getRotations(db).some((r) => r.name === assignment)) throw bad(`Unknown rotation "${assignment}"`);
      repo.setOverride(db, d, residentId, assignment || null);
      repo.audit(db, user(req), 'update', 'override', { date: d, residentId, assignment });
      res.json({ ok: true });
    }),
  );

  // Rotations
  const parseRotation = (body: any, sortOrder: number): Rotation => {
    const kind = str(body?.kind, 'kind');
    if (!['internal', 'external', 'special'].includes(kind)) throw bad('kind must be internal, external or special');
    return {
      name: str(body?.name, 'name'),
      kind: kind as Rotation['kind'],
      monthly: body?.monthly !== false,
      warnIfEmpty: kind === 'internal' && !!body?.warnIfEmpty,
      sortOrder: Number.isFinite(body?.sortOrder) ? Number(body.sortOrder) : sortOrder,
    };
  };

  app.post(
    '/api/rotations',
    wrap((req, res) => {
      const all = repo.getRotations(db);
      const r = parseRotation(req.body, Math.max(0, ...all.map((x) => x.sortOrder)) + 1);
      if (all.some((x) => x.name.toLowerCase() === r.name.toLowerCase())) throw bad(`Rotation "${r.name}" already exists`);
      repo.upsertRotation(db, r);
      repo.audit(db, user(req), 'create', 'rotation', r);
      res.json(r);
    }),
  );

  app.put(
    '/api/rotations/:name',
    wrap((req, res) => {
      const all = repo.getRotations(db);
      const before = all.find((x) => x.name === req.params.name);
      if (!before) throw new HttpError(404, 'Rotation not found');
      const r = parseRotation({ ...before, ...req.body }, before.sortOrder);
      if (before.kind === 'special' && (r.kind !== 'special' || r.name !== before.name))
        throw bad('The special roles "Vacation Cover" and "Post-Call" cannot be renamed or changed');
      db.transaction(() => {
        if (r.name !== before.name) {
          if (all.some((x) => x.name.toLowerCase() === r.name.toLowerCase() && x.name !== before.name)) throw bad(`Rotation "${r.name}" already exists`);
          repo.renameRotation(db, before.name, r.name);
        }
        repo.upsertRotation(db, r);
      })();
      repo.audit(db, user(req), 'update', 'rotation', { before, after: r });
      res.json(r);
    }),
  );

  app.delete(
    '/api/rotations/:name',
    wrap((req, res) => {
      const before = repo.getRotations(db).find((x) => x.name === req.params.name);
      if (!before) throw new HttpError(404, 'Rotation not found');
      if (before.kind === 'special') throw bad('Special roles cannot be deleted');
      const used = repo.rotationUsage(db, before.name);
      if (used > 0) throw bad(`"${before.name}" is used in ${used} schedule cell(s); reassign them first (or rename the rotation).`);
      const s = repo.getSettings(db);
      if (s.vacationCoverDefault === before.name || s.postCallIdleRotation === before.name)
        throw bad(`"${before.name}" is used as a default in Settings`);
      db.prepare('DELETE FROM rotations WHERE name = ?').run(before.name);
      repo.audit(db, user(req), 'delete', 'rotation', before);
      res.json({ ok: true });
    }),
  );

  // Settings
  app.put(
    '/api/settings',
    wrap((req, res) => {
      const before = repo.getSettings(db);
      const b = req.body ?? {};
      const rotations = repo.getRotations(db).map((r) => r.name);
      const next: Settings = { ...before };
      if (b.academicYearStartMonth !== undefined) {
        const m = Number(b.academicYearStartMonth);
        if (!(m >= 1 && m <= 12)) throw bad('academicYearStartMonth must be 1-12');
        next.academicYearStartMonth = m;
      }
      if (b.maxPerRotation !== undefined) {
        const m = Number(b.maxPerRotation);
        if (!(m >= 1 && m <= 20)) throw bad('maxPerRotation must be 1-20');
        next.maxPerRotation = m;
      }
      if (b.workingDays !== undefined) {
        if (!Array.isArray(b.workingDays) || b.workingDays.some((d: unknown) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6))
          throw bad('workingDays must be a list of 0-6');
        next.workingDays = [...new Set<number>(b.workingDays)].sort();
      }
      if (b.holidays !== undefined) {
        if (!Array.isArray(b.holidays) || b.holidays.some((d: unknown) => !isValidISO(d))) throw bad('holidays must be a list of dates');
        next.holidays = [...new Set<string>(b.holidays)].sort();
      }
      for (const k of ['vacationCoverDefault', 'postCallIdleRotation'] as const) {
        if (b[k] !== undefined) {
          if (!rotations.includes(b[k])) throw bad(`${k}: unknown rotation`);
          next[k] = b[k];
        }
      }
      for (const k of ['postCallAfterNonWorkingDay', 'externalEligibleForCalls', 'allowConsecutiveCalls'] as const) {
        if (b[k] !== undefined) next[k] = !!b[k];
      }
      repo.saveSettings(db, next);
      repo.audit(db, user(req), 'update', 'settings', { before, after: next });
      res.json(next);
    }),
  );

  // Import
  const rawXlsx = express.raw({ type: () => true, limit: '20mb' });
  const parseReq = async (req: Request) => {
    const mode: ImportMode = req.query.mode === 'merge' ? 'merge' : 'replace';
    const addUnknownRotations = req.query.addUnknown === '1';
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw bad('Upload an .xlsx file');
    const result = await parseWorkbook(req.body, {
      rotations: repo.getRotations(db),
      existingResidents: repo.getResidents(db),
      mode,
      addUnknownRotations,
    });
    return { mode, addUnknownRotations, ...result };
  };

  app.post(
    '/api/import/preview',
    rawXlsx,
    wrap(async (req, res) => {
      const { mode, data, messages, unknownRotations, addUnknownRotations } = await parseReq(req);
      const errors = messages.filter((m) => m.severity === 'error');
      res.json({
        mode,
        ok: errors.length === 0,
        messages,
        unknownRotations,
        summary: summarizeImport(db, data, mode, addUnknownRotations ? unknownRotations : []),
        data,
      });
    }),
  );

  app.post(
    '/api/import/commit',
    rawXlsx,
    wrap(async (req, res) => {
      const { mode, data, messages, unknownRotations, addUnknownRotations } = await parseReq(req);
      const errors = messages.filter((m) => m.severity === 'error');
      if (errors.length) return res.status(400).json({ error: `${errors.length} validation error(s); nothing was imported.`, messages });
      const summary = applyImport(db, data, mode, addUnknownRotations ? unknownRotations : [], user(req));
      res.json({ ok: true, summary });
    }),
  );

  // Reset to sample data (handy for demos)
  app.post(
    '/api/admin/reseed',
    wrap(async (req, res) => {
      const { seedDatabase } = await import('./seed');
      seedDatabase(db, today());
      repo.audit(db, user(req), 'reseed', 'database', {});
      res.json({ ok: true });
    }),
  );

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // ------------------------------------------------------------------ static client (production)
  const dist = path.resolve('client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: (err as Error)?.message ?? 'Server error' });
  });

  return app;
}

