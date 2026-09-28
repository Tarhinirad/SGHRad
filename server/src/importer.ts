import type { ParsedWorkbook } from './excel';
import {
  type DB,
  audit,
  clearScheduleData,
  getCalls,
  getMonthly,
  getResidents,
  getRotations,
  getVacations,
  insertVacation,
  setCall,
  setMonthly,
  upsertResident,
  upsertRotation,
} from './db';

export type ImportMode = 'replace' | 'merge';

export interface ImportSummary {
  mode: ImportMode;
  residents: { added: number; updated: number; unchanged: number; removed: number };
  monthlyCells: { changed: number; total: number };
  vacations: { added: number; skippedDuplicates: number; removed: number };
  calls: { changed: number; total: number };
  newRotations: string[];
}

/** Compute what an import would change, without writing anything. */
export function summarizeImport(db: DB, p: ParsedWorkbook, mode: ImportMode, newRotations: string[] = []): ImportSummary {
  const existing = new Map(getResidents(db).map((r) => [r.id, r]));
  const monthly = getMonthly(db);
  const vacations = getVacations(db);
  const calls = getCalls(db);
  const s: ImportSummary = {
    mode,
    residents: { added: 0, updated: 0, unchanged: 0, removed: 0 },
    monthlyCells: { changed: 0, total: 0 },
    vacations: { added: 0, skippedDuplicates: 0, removed: mode === 'replace' ? vacations.length : 0 },
    calls: { changed: 0, total: 0 },
    newRotations,
  };
  const fileIds = new Set(p.residents.map((r) => r.id));
  for (const r of p.residents) {
    const e = existing.get(r.id);
    if (!e) s.residents.added++;
    else if (e.name !== r.name || e.phone !== r.phone || e.year !== r.year || e.active !== r.active) s.residents.updated++;
    else s.residents.unchanged++;
  }
  if (mode === 'replace') s.residents.removed = [...existing.keys()].filter((id) => !fileIds.has(id)).length;

  for (const [id, months] of Object.entries(p.monthly))
    for (const [m, v] of Object.entries(months)) {
      s.monthlyCells.total++;
      if (monthly[id]?.[m] !== v) s.monthlyCells.changed++;
    }
  for (const v of p.vacations) {
    const dup = mode === 'merge' && vacations.some((x) => x.residentId === v.residentId && x.start === v.start && x.end === v.end);
    if (dup) s.vacations.skippedDuplicates++;
    else s.vacations.added++;
  }
  for (const [d, id] of Object.entries(p.calls)) {
    s.calls.total++;
    if (calls[d] !== id) s.calls.changed++;
  }
  return s;
}

/**
 * Write an import into the database in one transaction.
 *  replace – residents, monthly schedule, vacations and calls are replaced by the file's content
 *            (per-day cover choices / overrides made in the web app are kept).
 *  merge   – residents are upserted by ID; non-blank monthly cells and call rows overwrite;
 *            vacations are added unless an identical one exists.
 */
export function applyImport(db: DB, p: ParsedWorkbook, mode: ImportMode, newRotations: string[], user: string): ImportSummary {
  const summary = summarizeImport(db, p, mode, newRotations);
  db.transaction(() => {
    if (newRotations.length) {
      const max = Math.max(0, ...getRotations(db).map((r) => r.sortOrder));
      newRotations.forEach((name, i) => upsertRotation(db, { name, kind: 'external', monthly: true, warnIfEmpty: false, sortOrder: max + 1 + i }));
    }
    const existingVac = mode === 'merge' ? getVacations(db) : [];
    if (mode === 'replace') clearScheduleData(db);
    for (const r of p.residents) upsertResident(db, r);
    for (const [id, months] of Object.entries(p.monthly)) for (const [m, v] of Object.entries(months)) setMonthly(db, id, m, v);
    for (const v of p.vacations) {
      if (existingVac.some((x) => x.residentId === v.residentId && x.start === v.start && x.end === v.end)) continue;
      insertVacation(db, v);
    }
    for (const [d, id] of Object.entries(p.calls)) setCall(db, d, id);
    audit(db, user, 'import', 'workbook', summary);
  })();
  return summary;
}
