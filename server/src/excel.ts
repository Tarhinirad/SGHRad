/**
 * Excel import/export. The workbook format is fixed:
 *   Residents        ResidentID | Name | Phone | Year | Active
 *   Monthly Schedule ResidentID | Name | <one column per month, e.g. "Jul 2026"> …
 *   Vacations        ResidentID | Name | Start Date | End Date | Notes
 *   Daily Calls      Date | On-Call ResidentID | On-Call Name
 */
import ExcelJS from 'exceljs';
import {
  PGY_YEARS,
  SPLIT_SEPARATOR,
  normalizeMonthly,
  splitParts,
  academicYearMonths,
  daysInRange,
  firstOfMonth,
  isValidISO,
  lastOfMonth,
  monthLabel,
  parseMonthLabel,
  type ISODate,
  type MonthKey,
  type Resident,
  type Rotation,
  type ScheduleData,
  type Vacation,
} from '../../shared/src/index';

export const SHEETS = {
  residents: 'Residents',
  monthly: 'Monthly Schedule',
  vacations: 'Vacations',
  calls: 'Daily Calls',
} as const;

export const HEADERS = {
  residents: ['ResidentID', 'Name', 'Phone', 'Year', 'Active'],
  monthlyFixed: ['ResidentID', 'Name'],
  vacations: ['ResidentID', 'Name', 'Start Date', 'End Date', 'Notes'],
  calls: ['Date', 'On-Call ResidentID', 'On-Call Name'],
};

// ------------------------------------------------------------------------------------ export

export async function buildWorkbook(data: ScheduleData, yearStart: MonthKey): Promise<ExcelJS.Workbook> {
  const months = academicYearMonths(yearStart);
  const from = firstOfMonth(months[0]);
  const to = lastOfMonth(months[11]);
  const byId = new Map(data.residents.map((r) => [r.id, r]));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SGUMC Radiology Schedule';
  wb.created = new Date();

  const header = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: ws.name === SHEETS.monthly ? 2 : 0 }];
  };

  // Residents
  const wsR = wb.addWorksheet(SHEETS.residents);
  wsR.columns = [
    { header: 'ResidentID', key: 'id', width: 12 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Year', key: 'year', width: 9 },
    { header: 'Active', key: 'active', width: 8 },
  ];
  for (const r of data.residents) wsR.addRow({ id: r.id, name: r.name, phone: r.phone, year: r.year, active: r.active ? 'Y' : 'N' });
  const maxRow = Math.max(200, data.residents.length + 50);
  for (let i = 2; i <= maxRow; i++) {
    wsR.getCell(i, 3).numFmt = '@';
    wsR.getCell(i, 4).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${PGY_YEARS.join(',')}"`] };
    wsR.getCell(i, 5).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Y,N"'] };
  }
  header(wsR);

  // Monthly Schedule
  const wsM = wb.addWorksheet(SHEETS.monthly);
  wsM.columns = [
    { header: 'ResidentID', key: 'id', width: 12 },
    { header: 'Name', key: 'name', width: 28 },
    ...months.map((m) => ({ header: monthLabel(m), key: m, width: 15 })),
  ];
  // Make month headers text so Excel doesn't turn "Jul 2026" into a date.
  months.forEach((m, i) => {
    const c = wsM.getCell(1, 3 + i);
    c.value = monthLabel(m);
    c.numFmt = '@';
  });
  for (const r of data.residents) {
    const row: Record<string, string> = { id: r.id, name: r.name };
    for (const m of months) row[m] = data.monthly[r.id]?.[m] ?? '';
    wsM.addRow(row);
  }
  const list = data.rotations.filter((r) => r.monthly).map((r) => r.name).join(',');
  if (list.length <= 250) {
    for (let i = 2; i <= Math.max(60, data.residents.length + 20); i++)
      for (let j = 0; j < 12; j++) wsM.getCell(i, 3 + j).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list}"`] };
  }
  header(wsM);

  // Vacations
  const wsV = wb.addWorksheet(SHEETS.vacations);
  wsV.columns = [
    { header: 'ResidentID', key: 'id', width: 12 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Start Date', key: 'start', width: 13, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'End Date', key: 'end', width: 13, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Notes', key: 'notes', width: 36 },
  ];
  for (const v of data.vacations) {
    if (v.end < from || v.start > to) continue;
    wsV.addRow({ id: v.residentId, name: byId.get(v.residentId)?.name ?? '', start: toExcelDate(v.start), end: toExcelDate(v.end), notes: v.notes ?? '' });
  }
  header(wsV);

  // Daily Calls – one row per calendar day of the academic year
  const wsC = wb.addWorksheet(SHEETS.calls);
  wsC.columns = [
    { header: 'Date', key: 'date', width: 13, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'On-Call ResidentID', key: 'id', width: 18 },
    { header: 'On-Call Name', key: 'name', width: 28 },
  ];
  for (const d of daysInRange(from, to)) {
    const id = data.calls[d] ?? '';
    wsC.addRow({ date: toExcelDate(d), id, name: id ? byId.get(id)?.name ?? '' : '' });
  }
  header(wsC);

  return wb;
}

function toExcelDate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

// ------------------------------------------------------------------------------------ import

export interface ImportMessage {
  severity: 'error' | 'warning';
  sheet: string;
  row?: number;
  message: string;
}

export interface ParsedWorkbook {
  residents: Resident[];
  months: MonthKey[];
  /** residentId -> month -> value (blank cells omitted) */
  monthly: Record<string, Record<MonthKey, string>>;
  vacations: Vacation[];
  /** date -> residentId (blank rows omitted) */
  calls: Record<ISODate, string>;
  /** Dates present in the Daily Calls sheet (including blank ones). */
  callDates: ISODate[];
}

export interface ParseResult {
  data: ParsedWorkbook;
  messages: ImportMessage[];
  unknownRotations: string[];
}

export interface ParseOptions {
  rotations: Rotation[];
  /** Residents already in the database (used in merge mode to resolve IDs not present in the file). */
  existingResidents: Resident[];
  mode: 'replace' | 'merge';
  /** Treat unknown monthly values as new external rotations instead of errors. */
  addUnknownRotations?: boolean;
}

type CellValue = ExcelJS.CellValue;

export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v && typeof (v as any).text === 'string') return (v as any).text.trim();
    if ('result' in v) return cellText((v as any).result as CellValue);
    if ('error' in v) return '';
  }
  return String(v).trim();
}

/** Parse a date cell: real Excel dates, serial numbers, "YYYY-MM-DD", "DD/MM/YYYY". */
export function cellDate(v: CellValue): ISODate | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === 'object' && 'result' in v) return cellDate((v as any).result);
  const s = cellText(v);
  if (isValidISO(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidISO(iso) ? iso : null;
  }
  const t = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  if (t && isValidISO(t[1])) return t[1];
  return null;
}

function headerMonth(v: CellValue): MonthKey | null {
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  if (typeof v === 'number') return cellDate(v)?.slice(0, 7) ?? null;
  return parseMonthLabel(cellText(v));
}

function norm(s: string) {
  return s.toLowerCase().replace(/[\s_\-]+/g, '');
}

function checkHeaders(ws: ExcelJS.Worksheet, expected: string[], messages: ImportMessage[]): boolean {
  const row = ws.getRow(1);
  let ok = true;
  expected.forEach((h, i) => {
    const got = cellText(row.getCell(i + 1).value);
    if (norm(got) !== norm(h)) {
      ok = false;
      messages.push({ severity: 'error', sheet: ws.name, row: 1, message: `Column ${i + 1} should be "${h}" but is "${got || '(empty)'}".` });
    }
  });
  return ok;
}

function rowIsEmpty(row: ExcelJS.Row, cols: number): boolean {
  for (let i = 1; i <= cols; i++) if (cellText(row.getCell(i).value)) return false;
  return true;
}

export async function parseWorkbook(buffer: Buffer | ArrayBuffer, opts: ParseOptions): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  const messages: ImportMessage[] = [];
  const data: ParsedWorkbook = { residents: [], months: [], monthly: {}, vacations: [], calls: {}, callDates: [] };
  try {
    await wb.xlsx.load(buffer as any);
  } catch (e) {
    messages.push({ severity: 'error', sheet: '(file)', message: `Could not read the file as .xlsx: ${(e as Error).message}` });
    return { data, messages, unknownRotations: [] };
  }

  const sheet = (name: string) => {
    const ws = wb.worksheets.find((w) => norm(w.name) === norm(name));
    if (!ws) messages.push({ severity: 'error', sheet: name, message: `Sheet "${name}" is missing.` });
    return ws;
  };
  const rotNames = new Set(opts.rotations.map((r) => r.name));
  const rotLower = new Map(opts.rotations.map((r) => [r.name.toLowerCase(), r.name]));
  const unknownRotations = new Set<string>();

  // ---- Residents
  const wsR = sheet(SHEETS.residents);
  const fileIds = new Map<string, Resident>();
  if (wsR && checkHeaders(wsR, HEADERS.residents, messages)) {
    wsR.eachRow((row, n) => {
      if (n === 1 || rowIsEmpty(row, 5)) return;
      const id = cellText(row.getCell(1).value);
      const name = cellText(row.getCell(2).value);
      const phone = cellText(row.getCell(3).value);
      const yearRaw = cellText(row.getCell(4).value).toUpperCase().replace(/\s+/g, '').replace(/^PGY(\d)$/, 'PGY-$1');
      const activeRaw = cellText(row.getCell(5).value).toUpperCase();
      const err = (message: string) => messages.push({ severity: 'error', sheet: SHEETS.residents, row: n, message });
      if (!id) return err('ResidentID is empty.');
      if (!name) err(`${id}: Name is empty.`);
      if (fileIds.has(id)) return err(`Duplicate ResidentID "${id}".`);
      const year = (PGY_YEARS as readonly string[]).includes(yearRaw) ? (yearRaw as Resident['year']) : null;
      if (!year) err(`${id}: Year "${cellText(row.getCell(4).value)}" must be one of ${PGY_YEARS.join(', ')}.`);
      let active = true;
      if (['N', 'NO', 'FALSE', '0'].includes(activeRaw)) active = false;
      else if (!['Y', 'YES', 'TRUE', '1', ''].includes(activeRaw)) err(`${id}: Active must be Y or N (got "${activeRaw}").`);
      else if (activeRaw === '') messages.push({ severity: 'warning', sheet: SHEETS.residents, row: n, message: `${id}: Active is empty – assuming Y.` });
      const r: Resident = { id, name, phone, year: year ?? 'PGY-1', active };
      fileIds.set(id, r);
      data.residents.push(r);
    });
  }
  const known = new Map<string, Resident>(opts.mode === 'merge' ? opts.existingResidents.map((r) => [r.id, r]) : []);
  for (const [id, r] of fileIds) known.set(id, r);

  const checkResident = (sheetName: string, rowN: number, id: string, name: string): boolean => {
    const r = known.get(id);
    if (!r) {
      messages.push({ severity: 'error', sheet: sheetName, row: rowN, message: `Unknown ResidentID "${id}"${name ? ` (${name})` : ''}.` });
      return false;
    }
    if (name && norm(name) !== norm(r.name))
      messages.push({ severity: 'warning', sheet: sheetName, row: rowN, message: `Name "${name}" does not match ${id} (${r.name}); the ID is used.` });
    return true;
  };

  // ---- Monthly Schedule
  const wsM = sheet(SHEETS.monthly);
  if (wsM && checkHeaders(wsM, HEADERS.monthlyFixed, messages)) {
    const header = wsM.getRow(1);
    const cols: { col: number; month: MonthKey }[] = [];
    for (let c = 3; c <= header.cellCount; c++) {
      const raw = header.getCell(c).value;
      if (!cellText(raw)) continue;
      const month = headerMonth(raw);
      if (!month) messages.push({ severity: 'error', sheet: SHEETS.monthly, row: 1, message: `Column ${c}: "${cellText(raw)}" is not a month (use e.g. "Jul 2026").` });
      else if (cols.some((x) => x.month === month)) messages.push({ severity: 'error', sheet: SHEETS.monthly, row: 1, message: `Month ${monthLabel(month)} appears twice.` });
      else cols.push({ col: c, month });
    }
    data.months = cols.map((c) => c.month);
    if (cols.length === 0) messages.push({ severity: 'error', sheet: SHEETS.monthly, row: 1, message: 'No month columns found.' });
    const seen = new Set<string>();
    wsM.eachRow((row, n) => {
      if (n === 1 || rowIsEmpty(row, 2 + cols.length)) return;
      const id = cellText(row.getCell(1).value);
      const name = cellText(row.getCell(2).value);
      if (!id) return messages.push({ severity: 'error', sheet: SHEETS.monthly, row: n, message: 'ResidentID is empty.' });
      if (seen.has(id)) return messages.push({ severity: 'error', sheet: SHEETS.monthly, row: n, message: `Resident "${id}" appears twice.` });
      seen.add(id);
      if (!checkResident(SHEETS.monthly, n, id, name)) return;
      for (const { col, month } of cols) {
        const raw = cellText(row.getCell(col).value);
        if (!raw) continue;
        // "Body/IR" = split month: first half Body, second half IR.
        const parts = splitParts(raw);
        if (parts.length > 2) {
          messages.push({ severity: 'error', sheet: SHEETS.monthly, row: n, message: `${id} ${monthLabel(month)}: "${raw}" – a month can be split into at most two rotations (e.g. "Body/IR").` });
          continue;
        }
        const fixedParts = parts.map((p) => {
          if (rotNames.has(p)) return p;
          const fixed = rotLower.get(p.toLowerCase());
          if (fixed) return fixed;
          unknownRotations.add(p);
          messages.push({
            severity: opts.addUnknownRotations ? 'warning' : 'error',
            sheet: SHEETS.monthly,
            row: n,
            message: `${id} ${monthLabel(month)}: unknown rotation "${p}"${opts.addUnknownRotations ? ' – will be added as an external rotation.' : '.'}`,
          });
          return p;
        });
        (data.monthly[id] ??= {})[month] = normalizeMonthly(fixedParts.join(SPLIT_SEPARATOR));
      }
    });
  }

  // ---- Vacations
  const wsV = sheet(SHEETS.vacations);
  if (wsV && checkHeaders(wsV, HEADERS.vacations, messages)) {
    wsV.eachRow((row, n) => {
      if (n === 1 || rowIsEmpty(row, 5)) return;
      const id = cellText(row.getCell(1).value);
      const name = cellText(row.getCell(2).value);
      const err = (message: string) => messages.push({ severity: 'error', sheet: SHEETS.vacations, row: n, message });
      if (!id) return err('ResidentID is empty.');
      if (!checkResident(SHEETS.vacations, n, id, name)) return;
      const start = cellDate(row.getCell(3).value);
      const end = cellDate(row.getCell(4).value);
      if (!start) return err(`Invalid Start Date "${cellText(row.getCell(3).value)}".`);
      if (!end) return err(`Invalid End Date "${cellText(row.getCell(4).value)}".`);
      if (end < start) return err(`End Date ${end} is before Start Date ${start}.`);
      const overlap = data.vacations.find((v) => v.residentId === id && v.start <= end && start <= v.end);
      if (overlap)
        messages.push({ severity: 'warning', sheet: SHEETS.vacations, row: n, message: `${id}: overlaps another vacation (${overlap.start} – ${overlap.end}).` });
      data.vacations.push({ residentId: id, start, end, notes: cellText(row.getCell(5).value) });
    });
  }

  // ---- Daily Calls
  const wsC = sheet(SHEETS.calls);
  if (wsC && checkHeaders(wsC, HEADERS.calls, messages)) {
    wsC.eachRow((row, n) => {
      if (n === 1 || rowIsEmpty(row, 3)) return;
      const date = cellDate(row.getCell(1).value);
      if (!date) return messages.push({ severity: 'error', sheet: SHEETS.calls, row: n, message: `Invalid Date "${cellText(row.getCell(1).value)}".` });
      if (data.callDates.includes(date)) messages.push({ severity: 'warning', sheet: SHEETS.calls, row: n, message: `${date} appears more than once; the last row wins.` });
      data.callDates.push(date);
      const id = cellText(row.getCell(2).value);
      const name = cellText(row.getCell(3).value);
      if (!id) {
        if (name) messages.push({ severity: 'error', sheet: SHEETS.calls, row: n, message: `${date}: On-Call Name given without ResidentID.` });
        return;
      }
      if (!checkResident(SHEETS.calls, n, id, name)) return;
      data.calls[date] = id;
    });
    if (data.callDates.length > 1) {
      const sorted = [...data.callDates].sort();
      const missing = daysInRange(sorted[0], sorted[sorted.length - 1]).filter((d) => !data.callDates.includes(d));
      if (missing.length)
        messages.push({
          severity: 'warning',
          sheet: SHEETS.calls,
          message: `${missing.length} day(s) missing from Daily Calls (e.g. ${missing.slice(0, 3).join(', ')}).`,
        });
    }
  }

  return { data, messages, unknownRotations: [...unknownRotations] };
}
