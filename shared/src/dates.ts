// Date helpers that work on ISO "YYYY-MM-DD" strings in UTC so that the
// schedule never shifts because of the server's or browser's time zone.

export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function isValidISO(d: unknown): d is ISODate {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return toISO(parseISO(d)) === d;
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = parseISO(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISO(dt);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(d: ISODate): number {
  return parseISO(d).getUTCDay();
}

export function monthOf(d: ISODate): MonthKey {
  return d.slice(0, 7);
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function daysInRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function firstOfMonth(m: MonthKey): ISODate {
  return `${m}-01`;
}

export function lastOfMonth(m: MonthKey): ISODate {
  return addDays(firstOfMonth(addMonths(m, 1)), -1);
}

/** Monday of the week containing d */
export function startOfWeek(d: ISODate): ISODate {
  const wd = weekday(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

/** The 12 months of the academic year that starts at `startMonth` (e.g. "2026-07"). */
export function academicYearMonths(startMonth: MonthKey): MonthKey[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(startMonth, i));
}

/** Academic year start month containing date d, given the month number (1-12) the year starts in. */
export function academicYearStartFor(d: ISODate, startMonthNumber: number): MonthKey {
  const [y, m] = d.split('-').map(Number);
  const year = m >= startMonthNumber ? y : y - 1;
  return `${year}-${String(startMonthNumber).padStart(2, '0')}`;
}

/** "2026-07" -> "Jul 2026" (the Excel column header format) */
export function monthLabel(m: MonthKey): string {
  const [y, mo] = m.split('-').map(Number);
  return `${MONTH_ABBR[mo - 1]} ${y}`;
}

/** Accepts "Jul 2026", "Jul-2026", "July 2026", "2026-07", "07/2026". Returns null if unparseable. */
export function parseMonthLabel(s: string): MonthKey | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) return fmtMonth(+m[1], +m[2]);
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return fmtMonth(+m[2], +m[1]);
  m = /^([A-Za-z]{3,9})[\s\-_']+(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const idx = MONTH_ABBR.findIndex((a) => a.toLowerCase() === m![1].slice(0, 3).toLowerCase());
    if (idx < 0) return null;
    const year = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return fmtMonth(year, idx + 1);
  }
  return null;
}

function fmtMonth(y: number, mo: number): MonthKey | null {
  if (mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

export function formatDateLong(d: ISODate): string {
  const dt = parseISO(d);
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateShort(d: ISODate): string {
  const dt = parseISO(d);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
