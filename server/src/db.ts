import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ROTATIONS,
  DEFAULT_SETTINGS,
  type ISODate,
  type Resident,
  type Rotation,
  type ScheduleData,
  type Settings,
  type Vacation,
} from '../../shared/src/index';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS residents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS rotations (
  name TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('internal','external','special')),
  monthly INTEGER NOT NULL DEFAULT 1,
  warn_if_empty INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS monthly (
  resident_id TEXT NOT NULL,
  month TEXT NOT NULL,
  rotation TEXT NOT NULL,
  PRIMARY KEY (resident_id, month)
);
CREATE TABLE IF NOT EXISTS vacations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS calls (
  date TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cover_choices (
  date TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS overrides (
  date TEXT NOT NULL,
  resident_id TEXT NOT NULL,
  assignment TEXT NOT NULL,
  PRIMARY KEY (date, resident_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  user TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  details TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vac_res ON vacations(resident_id);
`;

/** Open the SQLite database from a file path, ':memory:', or a serialized snapshot (Buffer). */
export function openDb(source: string | Buffer = process.env.DB_FILE ?? path.resolve('data/sghrad.db')): DB {
  if (typeof source === 'string' && source !== ':memory:') fs.mkdirSync(path.dirname(source), { recursive: true });
  const db = new Database(source);
  if (typeof source === 'string' && source !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const count = db.prepare('SELECT COUNT(*) AS n FROM rotations').get() as { n: number };
  if (count.n === 0) replaceRotations(db, DEFAULT_ROTATIONS);
  return db;
}

export function isEmpty(db: DB): boolean {
  return (db.prepare('SELECT COUNT(*) AS n FROM residents').get() as { n: number }).n === 0;
}

// ---------------------------------------------------------------- residents
export function getResidents(db: DB): Resident[] {
  const rows = db.prepare('SELECT * FROM residents ORDER BY year, name').all() as any[];
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, year: r.year, active: !!r.active }));
}

export function upsertResident(db: DB, r: Resident) {
  db.prepare(
    `INSERT INTO residents (id, name, phone, year, active) VALUES (@id, @name, @phone, @year, @active)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, year=excluded.year, active=excluded.active`,
  ).run({ id: r.id, name: r.name, phone: r.phone ?? '', year: r.year, active: r.active ? 1 : 0 });
}

// ---------------------------------------------------------------- rotations
export function getRotations(db: DB): Rotation[] {
  const rows = db.prepare('SELECT * FROM rotations ORDER BY sort_order, name').all() as any[];
  return rows.map((r) => ({ name: r.name, kind: r.kind, monthly: !!r.monthly, warnIfEmpty: !!r.warn_if_empty, sortOrder: r.sort_order }));
}

export function upsertRotation(db: DB, r: Rotation) {
  db.prepare(
    `INSERT INTO rotations (name, kind, monthly, warn_if_empty, sort_order) VALUES (@name, @kind, @monthly, @warnIfEmpty, @sortOrder)
     ON CONFLICT(name) DO UPDATE SET kind=excluded.kind, monthly=excluded.monthly, warn_if_empty=excluded.warn_if_empty, sort_order=excluded.sort_order`,
  ).run({ name: r.name, kind: r.kind, monthly: r.monthly ? 1 : 0, warnIfEmpty: r.warnIfEmpty ? 1 : 0, sortOrder: r.sortOrder });
}

export function replaceRotations(db: DB, rotations: Rotation[]) {
  db.prepare('DELETE FROM rotations').run();
  for (const r of rotations) upsertRotation(db, r);
}

/** Rename a rotation and every reference to it (monthly cells, overrides, settings). */
export function renameRotation(db: DB, from: string, to: string) {
  db.prepare('UPDATE rotations SET name = ? WHERE name = ?').run(to, from);
  db.prepare('UPDATE monthly SET rotation = ? WHERE rotation = ?').run(to, from);
  db.prepare('UPDATE overrides SET assignment = ? WHERE assignment = ?').run(to, from);
  const s = getSettings(db);
  let changed = false;
  if (s.vacationCoverDefault === from) {
    s.vacationCoverDefault = to;
    changed = true;
  }
  if (s.postCallIdleRotation === from) {
    s.postCallIdleRotation = to;
    changed = true;
  }
  if (changed) saveSettings(db, s);
}

export function rotationUsage(db: DB, name: string): number {
  const a = db.prepare('SELECT COUNT(*) AS n FROM monthly WHERE rotation = ?').get(name) as { n: number };
  const b = db.prepare('SELECT COUNT(*) AS n FROM overrides WHERE assignment = ?').get(name) as { n: number };
  return a.n + b.n;
}

// ---------------------------------------------------------------- monthly
export function getMonthly(db: DB): ScheduleData['monthly'] {
  const out: ScheduleData['monthly'] = {};
  for (const r of db.prepare('SELECT * FROM monthly').all() as any[]) (out[r.resident_id] ??= {})[r.month] = r.rotation;
  return out;
}

export function setMonthly(db: DB, residentId: string, month: string, rotation: string | null) {
  if (!rotation) db.prepare('DELETE FROM monthly WHERE resident_id = ? AND month = ?').run(residentId, month);
  else
    db.prepare(
      `INSERT INTO monthly (resident_id, month, rotation) VALUES (?, ?, ?)
       ON CONFLICT(resident_id, month) DO UPDATE SET rotation = excluded.rotation`,
    ).run(residentId, month, rotation);
}

// ---------------------------------------------------------------- vacations
export function getVacations(db: DB): Vacation[] {
  return (db.prepare('SELECT * FROM vacations ORDER BY start, resident_id').all() as any[]).map((v) => ({
    id: v.id,
    residentId: v.resident_id,
    start: v.start,
    end: v.end,
    notes: v.notes,
  }));
}

export function insertVacation(db: DB, v: Vacation): number {
  const r = db
    .prepare('INSERT INTO vacations (resident_id, start, end, notes) VALUES (?, ?, ?, ?)')
    .run(v.residentId, v.start, v.end, v.notes ?? '');
  return Number(r.lastInsertRowid);
}

// ---------------------------------------------------------------- calls / cover choices / overrides
export function getCalls(db: DB): Record<ISODate, string> {
  const out: Record<string, string> = {};
  for (const r of db.prepare('SELECT * FROM calls').all() as any[]) out[r.date] = r.resident_id;
  return out;
}

export function setCall(db: DB, date: ISODate, residentId: string | null) {
  if (!residentId) db.prepare('DELETE FROM calls WHERE date = ?').run(date);
  else
    db.prepare('INSERT INTO calls (date, resident_id) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET resident_id = excluded.resident_id').run(
      date,
      residentId,
    );
}

export function getCoverChoices(db: DB): Record<ISODate, string> {
  const out: Record<string, string> = {};
  for (const r of db.prepare('SELECT * FROM cover_choices').all() as any[]) out[r.date] = r.resident_id;
  return out;
}

export function setCoverChoice(db: DB, date: ISODate, residentId: string | null) {
  if (!residentId) db.prepare('DELETE FROM cover_choices WHERE date = ?').run(date);
  else
    db.prepare(
      'INSERT INTO cover_choices (date, resident_id) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET resident_id = excluded.resident_id',
    ).run(date, residentId);
}

export function getOverrides(db: DB): ScheduleData['overrides'] {
  const out: ScheduleData['overrides'] = {};
  for (const r of db.prepare('SELECT * FROM overrides').all() as any[]) (out[r.date] ??= {})[r.resident_id] = r.assignment;
  return out;
}

export function setOverride(db: DB, date: ISODate, residentId: string, assignment: string | null) {
  if (!assignment) db.prepare('DELETE FROM overrides WHERE date = ? AND resident_id = ?').run(date, residentId);
  else
    db.prepare(
      `INSERT INTO overrides (date, resident_id, assignment) VALUES (?, ?, ?)
       ON CONFLICT(date, resident_id) DO UPDATE SET assignment = excluded.assignment`,
    ).run(date, residentId, assignment);
}

// ---------------------------------------------------------------- settings
export function getSetting(db: DB, key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}

export function putSetting(db: DB, key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getSettings(db: DB): Settings {
  const raw = getSetting(db, 'schedule');
  return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
}

export function saveSettings(db: DB, s: Settings) {
  putSetting(db, 'schedule', JSON.stringify(s));
}

// ---------------------------------------------------------------- audit log
export interface AuditEntry {
  id: number;
  ts: string;
  user: string;
  action: string;
  entity: string;
  details: unknown;
}

export function audit(db: DB, user: string, action: string, entity: string, details: unknown) {
  db.prepare('INSERT INTO audit (ts, user, action, entity, details) VALUES (?, ?, ?, ?, ?)').run(
    new Date().toISOString(),
    user,
    action,
    entity,
    JSON.stringify(details ?? null),
  );
}

export function getAudit(db: DB, limit = 200, offset = 0): { total: number; entries: AuditEntry[] } {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM audit').get() as { n: number }).n;
  const entries = (db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset) as any[]).map((r) => ({
    ...r,
    details: JSON.parse(r.details),
  }));
  return { total, entries };
}

// ---------------------------------------------------------------- aggregate
export function loadScheduleData(db: DB): ScheduleData {
  return {
    residents: getResidents(db),
    rotations: getRotations(db),
    monthly: getMonthly(db),
    vacations: getVacations(db),
    calls: getCalls(db),
    coverChoices: getCoverChoices(db),
    overrides: getOverrides(db),
    settings: getSettings(db),
  };
}

/** Wipe the data held in the Excel workbook (residents, monthly, vacations, calls). */
export function clearScheduleData(db: DB, includeWebOnly = false) {
  const tables = ['residents', 'monthly', 'vacations', 'calls'];
  if (includeWebOnly) tables.push('cover_choices', 'overrides');
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
}
