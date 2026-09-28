import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROTATIONS, ScheduleEngine } from '../../shared/src/index';
import { getCalls, getMonthly, getResidents, getRotations, getVacations, loadScheduleData, openDb } from '../src/db';
import { buildWorkbook, parseWorkbook, SHEETS } from '../src/excel';
import { applyImport } from '../src/importer';
import { SAMPLE_RESIDENTS, seedDatabase } from '../src/seed';

const TODAY = '2026-09-28';

async function toBuffer(wb: ExcelJS.Workbook) {
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

function seeded() {
  const db = openDb(':memory:');
  seedDatabase(db, TODAY);
  return db;
}

const opts = (db: ReturnType<typeof openDb>, mode: 'replace' | 'merge' = 'replace') => ({
  rotations: getRotations(db),
  existingResidents: getResidents(db),
  mode,
});

describe('seed data', () => {
  it('creates 14 residents across PGY-1..4 with one Vacation Cover and one Post-Call each month', () => {
    const db = seeded();
    const data = loadScheduleData(db);
    expect(data.residents).toHaveLength(14);
    expect(new Set(data.residents.map((r) => r.year))).toEqual(new Set(['PGY-1', 'PGY-2', 'PGY-3', 'PGY-4']));
    const e = new ScheduleEngine(data);
    const monthCodes = e.monthIssues('2026-09').map((i) => i.code);
    expect(monthCodes).not.toContain('no-vacation-cover');
    expect(monthCodes).not.toContain('no-post-call');
    expect(Object.keys(data.calls).length).toBeGreaterThan(360);
    // Seeded calls never collide with vacations.
    expect(e.issues('2026-07-01', '2027-06-30').filter((i) => i.code === 'vacation-and-call')).toHaveLength(0);
  });
});

describe('Excel export → import round trip', () => {
  it('exports the four sheets with the exact headers', async () => {
    const db = seeded();
    const wb = await buildWorkbook(loadScheduleData(db), '2026-07');
    expect(wb.worksheets.map((w) => w.name)).toEqual([SHEETS.residents, SHEETS.monthly, SHEETS.vacations, SHEETS.calls]);
    const headers = (name: string) => (wb.getWorksheet(name)!.getRow(1).values as unknown[]).slice(1);
    expect(headers(SHEETS.residents)).toEqual(['ResidentID', 'Name', 'Phone', 'Year', 'Active']);
    expect(headers(SHEETS.monthly).slice(0, 4)).toEqual(['ResidentID', 'Name', 'Jul 2026', 'Aug 2026']);
    expect(headers(SHEETS.monthly)).toHaveLength(14);
    expect(headers(SHEETS.vacations)).toEqual(['ResidentID', 'Name', 'Start Date', 'End Date', 'Notes']);
    expect(headers(SHEETS.calls)).toEqual(['Date', 'On-Call ResidentID', 'On-Call Name']);
    expect(wb.getWorksheet(SHEETS.calls)!.rowCount).toBe(1 + 365);
  });

  it('re-imports its own export losslessly (replace mode)', async () => {
    const db = seeded();
    const before = loadScheduleData(db);
    const buf = await toBuffer(await buildWorkbook(before, '2026-07'));

    const db2 = openDb(':memory:');
    const parsed = await parseWorkbook(buf, opts(db2));
    expect(parsed.messages.filter((m) => m.severity === 'error')).toEqual([]);
    applyImport(db2, parsed.data, 'replace', [], 'test');
    expect(getResidents(db2)).toEqual(before.residents);
    expect(getMonthly(db2)).toEqual(before.monthly);
    expect(getCalls(db2)).toEqual(before.calls);
    expect(getVacations(db2).map(({ id: _id, ...v }) => v)).toEqual(before.vacations.map(({ id: _id, ...v }) => v));
  });
});

async function workbookWith(edit: (wb: ExcelJS.Workbook) => void) {
  const db = seeded();
  const wb = await buildWorkbook(loadScheduleData(db), '2026-07');
  edit(wb);
  return { db, buf: await toBuffer(wb) };
}

describe('import validation', () => {
  it('rejects a missing sheet', async () => {
    const { db, buf } = await workbookWith((wb) => wb.removeWorksheet(wb.getWorksheet(SHEETS.vacations)!.id));
    const r = await parseWorkbook(buf, opts(db));
    expect(r.messages.some((m) => m.severity === 'error' && m.message.includes('Vacations'))).toBe(true);
  });

  it('rejects wrong headers', async () => {
    const { db, buf } = await workbookWith((wb) => (wb.getWorksheet(SHEETS.residents)!.getCell('C1').value = 'Mobile'));
    const r = await parseWorkbook(buf, opts(db));
    expect(r.messages.some((m) => m.severity === 'error' && m.message.includes('"Phone"'))).toBe(true);
  });

  it('flags unknown rotation values, or accepts them as new external rotations', async () => {
    const { db, buf } = await workbookWith((wb) => (wb.getWorksheet(SHEETS.monthly)!.getCell('C2').value = 'Cardiac CT'));
    const r = await parseWorkbook(buf, opts(db));
    expect(r.unknownRotations).toEqual(['Cardiac CT']);
    expect(r.messages.some((m) => m.severity === 'error' && m.message.includes('Cardiac CT'))).toBe(true);

    const r2 = await parseWorkbook(buf, { ...opts(db), addUnknownRotations: true });
    expect(r2.messages.filter((m) => m.severity === 'error')).toEqual([]);
    applyImport(db, r2.data, 'replace', r2.unknownRotations, 'test');
    expect(getRotations(db).find((x) => x.name === 'Cardiac CT')?.kind).toBe('external');
  });

  it('fixes rotation capitalisation silently', async () => {
    const { db, buf } = await workbookWith((wb) => (wb.getWorksheet(SHEETS.monthly)!.getCell('C2').value = 'body mri'));
    const r = await parseWorkbook(buf, opts(db));
    expect(r.messages.filter((m) => m.severity === 'error')).toEqual([]);
    expect(Object.values(r.data.monthly)[0]['2026-07']).toBe('Body MRI');
  });

  it('flags invalid year, duplicate IDs, bad dates, reversed ranges and unknown residents', async () => {
    const { db, buf } = await workbookWith((wb) => {
      const r = wb.getWorksheet(SHEETS.residents)!;
      r.getCell('D2').value = 'PGY-7';
      r.addRow([r.getCell('A2').value, 'Dup', '', 'PGY-1', 'Y']);
      const v = wb.getWorksheet(SHEETS.vacations)!;
      v.getCell('C2').value = 'not a date';
      v.getCell('C3').value = new Date(Date.UTC(2027, 0, 10));
      v.getCell('D3').value = new Date(Date.UTC(2027, 0, 5));
      wb.getWorksheet(SHEETS.calls)!.getCell('B2').value = 'R99';
    });
    const r = await parseWorkbook(buf, opts(db));
    const errs = r.messages.filter((m) => m.severity === 'error').map((m) => m.message).join('\n');
    expect(errs).toMatch(/PGY-7/);
    expect(errs).toMatch(/Duplicate ResidentID/);
    expect(errs).toMatch(/Invalid Start Date/);
    expect(errs).toMatch(/before Start Date/);
    expect(errs).toMatch(/Unknown ResidentID "R99"/);
  });

  it('accepts text dates (DD/MM/YYYY and ISO) and month headers typed as dates', async () => {
    const { db, buf } = await workbookWith((wb) => {
      const v = wb.getWorksheet(SHEETS.vacations)!;
      v.getCell('C2').value = '01/08/2026';
      v.getCell('D2').value = '2026-08-05';
      wb.getWorksheet(SHEETS.monthly)!.getCell('C1').value = new Date(Date.UTC(2026, 6, 1));
    });
    const r = await parseWorkbook(buf, opts(db));
    expect(r.messages.filter((m) => m.severity === 'error')).toEqual([]);
    expect(r.data.vacations[0]).toMatchObject({ start: '2026-08-01', end: '2026-08-05' });
    expect(r.data.months[0]).toBe('2026-07');
  });

  it('warns on name/ID mismatch but uses the ID', async () => {
    const { db, buf } = await workbookWith((wb) => (wb.getWorksheet(SHEETS.calls)!.getCell('C2').value = 'Somebody Else'));
    const r = await parseWorkbook(buf, opts(db));
    expect(r.messages.some((m) => m.severity === 'warning' && m.message.includes('does not match'))).toBe(true);
    expect(r.messages.filter((m) => m.severity === 'error')).toEqual([]);
  });

  it('merge mode resolves residents from the database and skips duplicate vacations', async () => {
    const db = seeded();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet(SHEETS.residents).addRow(['ResidentID', 'Name', 'Phone', 'Year', 'Active']);
    const m = wb.addWorksheet(SHEETS.monthly);
    m.addRow(['ResidentID', 'Name', 'Jan 2027']);
    m.addRow(['R01', SAMPLE_RESIDENTS[0].name, 'IR']);
    const v = wb.addWorksheet(SHEETS.vacations);
    v.addRow(['ResidentID', 'Name', 'Start Date', 'End Date', 'Notes']);
    const existing = getVacations(db)[0];
    v.addRow([existing.residentId, '', existing.start, existing.end, '']);
    v.addRow(['R02', '', '2027-03-01', '2027-03-03', 'new']);
    const c = wb.addWorksheet(SHEETS.calls);
    c.addRow(['Date', 'On-Call ResidentID', 'On-Call Name']);
    c.addRow(['2027-01-04', 'R03', '']);
    const buf = await toBuffer(wb);

    const r = await parseWorkbook(buf, opts(db, 'merge'));
    expect(r.messages.filter((x) => x.severity === 'error')).toEqual([]);
    const vacBefore = getVacations(db).length;
    const summary = applyImport(db, r.data, 'merge', [], 'test');
    expect(summary.vacations).toMatchObject({ added: 1, skippedDuplicates: 1 });
    expect(getVacations(db)).toHaveLength(vacBefore + 1);
    expect(getMonthly(db)['R01']['2027-01']).toBe('IR');
    expect(getCalls(db)['2027-01-04']).toBe('R03');
    expect(getResidents(db)).toHaveLength(14);

    // The same file in replace mode fails: the residents are not in the file.
    const r2 = await parseWorkbook(buf, opts(db, 'replace'));
    expect(r2.messages.some((x) => x.severity === 'error' && x.message.includes('Unknown ResidentID'))).toBe(true);
  });

  it('imports split months ("Body/IR") and validates each half', async () => {
    const { db, buf } = await workbookWith((wb) => {
      const m = wb.getWorksheet(SHEETS.monthly)!;
      m.getCell('C2').value = 'body / ir';
      m.getCell('F2').value = 'body mri + nuclear';
      m.getCell('D2').value = 'Body/Cardiac';
      m.getCell('E2').value = 'Body/IR/US';
    });
    const r = await parseWorkbook(buf, opts(db));
    const first = Object.values(r.data.monthly)[0];
    expect(first['2026-07']).toBe('Body/IR');
    expect(first['2026-10']).toBe('Body MRI+Nuclear');
    const errs = r.messages.filter((x) => x.severity === 'error').map((x) => x.message).join('\n');
    expect(errs).toMatch(/unknown rotation "Cardiac"/);
    expect(errs).toMatch(/at most two rotations/);
    expect(errs).not.toMatch(/Jul 2026/);
  });

  it('reports a non-xlsx file', async () => {
    const r = await parseWorkbook(Buffer.from('hello'), { rotations: DEFAULT_ROTATIONS, existingResidents: [], mode: 'replace' });
    expect(r.messages[0].severity).toBe('error');
  });
});
