import type { ISODate, MonthKey } from './dates';

export const PGY_YEARS = ['PGY-1', 'PGY-2', 'PGY-3', 'PGY-4'] as const;
export type PgyYear = (typeof PGY_YEARS)[number];

/**
 * internal – a department rotation shown on the daily/weekly schedule and capacity-checked
 * external – off-site rotation (Vascular, Elective…); excluded from the department display
 * special  – a role, not a place: "Vacation Cover" and "Post-Call"
 */
export type RotationKind = 'internal' | 'external' | 'special';

export interface Rotation {
  name: string;
  kind: RotationKind;
  /** Can be picked in the monthly schedule (Mammography is internal but not monthly). */
  monthly: boolean;
  /** Warn when nobody is on this internal rotation on a working day. */
  warnIfEmpty: boolean;
  sortOrder: number;
}

export interface Resident {
  id: string;
  name: string;
  phone: string;
  year: PgyYear;
  active: boolean;
}

export interface Vacation {
  id?: number;
  residentId: string;
  start: ISODate;
  end: ISODate;
  notes?: string;
}

export interface Settings {
  /** Month number (1-12) in which the academic year starts. */
  academicYearStartMonth: number;
  /** Maximum residents allowed on an internal rotation per day. */
  maxPerRotation: number;
  /** Days of the week (0 = Sun … 6 = Sat) on which rotations are staffed. */
  workingDays: number[];
  /** Holidays (no rotation staffing), ISO dates. */
  holidays: ISODate[];
  /** Where the Vacation Cover resident goes when nobody is on vacation. */
  vacationCoverDefault: string;
  /** Where the Post-Call resident goes when there is nobody to replace. */
  postCallIdleRotation: string;
  /** If true, a call on a weekend/holiday still makes the resident post-call on the next working day. */
  postCallAfterNonWorkingDay: boolean;
  /** If false, calling a resident who is on an external rotation raises a warning. */
  externalEligibleForCalls: boolean;
  /** If false, the same resident on call two days in a row raises a warning. */
  allowConsecutiveCalls: boolean;
  /** Split months ("Body/IR"): the first rotation runs from day 1 to this day, the second from the next day to month end. */
  splitDay: number;
  /** Hospital time (HH:MM) at which a call listed on a working day starts (e.g. 16:30). */
  callWeekdayStart: string;
  /** Hospital time (HH:MM) at which a call listed on a weekend/holiday starts (e.g. 08:00). */
  callOffDayStart: string;
  /** Hospital time (HH:MM) next morning at which every call ends and the previous call's resident hands over. */
  callEnd: string;
}

export const DEFAULT_SETTINGS: Settings = {
  academicYearStartMonth: 7,
  maxPerRotation: 3,
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
  vacationCoverDefault: 'Mammography',
  postCallIdleRotation: 'Mammography',
  postCallAfterNonWorkingDay: true,
  externalEligibleForCalls: true,
  allowConsecutiveCalls: false,
  splitDay: 15,
  callWeekdayStart: '16:30',
  callOffDayStart: '08:00',
  callEnd: '08:00',
};

export const VACATION_COVER = 'Vacation Cover';

/** Separator for a split month in the Monthly Schedule, e.g. "Body/IR" = first half Body, second half IR. */
export const SPLIT_SEPARATOR = '/';

/** Joins rotations covered at the same time by one resident, e.g. "Body+IR" = Body and IR together. */
export const COMBO_SEPARATOR = '+';

/** "Body + IR" -> ["Body", "IR"]; "Body" -> ["Body"]. */
export function comboParts(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(COMBO_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Every rotation named in a monthly value, across halves and combinations ("Body+IR/US" -> Body, IR, US). */
export function rotationNames(value: string | null | undefined): string[] {
  return splitParts(value).flatMap(comboParts);
}

/** Rewrite every rotation name inside a monthly value, keeping its "/" halves and "+" combinations. */
export function mapRotationNames(value: string, fn: (name: string) => string): string {
  return splitParts(value)
    .map((h) => comboParts(h).map(fn).join(COMBO_SEPARATOR))
    .join(SPLIT_SEPARATOR);
}

/** "Body / IR" -> ["Body", "IR"]; "Body" -> ["Body"]. */
export function splitParts(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(SPLIT_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Canonical form of a monthly value: parts trimmed and joined by "/", identical halves collapsed. */
export function normalizeMonthly(value: string | null | undefined): string {
  // Each half may combine rotations with "+": trim and de-duplicate them.
  const parts = splitParts(value).map((h) => [...new Set(comboParts(h))].join(COMBO_SEPARATOR)).filter(Boolean);
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
  return parts.join(SPLIT_SEPARATOR);
}

/** The rotation that applies on a given date (1-based day of month) for a possibly split monthly value. */
export function monthlyOnDay(value: string | null | undefined, dayOfMonth: number, splitDay: number): string | null {
  const parts = splitParts(value);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return dayOfMonth <= splitDay ? parts[0] : parts[parts.length - 1];
}
export const POST_CALL = 'Post-Call';

export const DEFAULT_ROTATIONS: Rotation[] = [
  { name: 'Body', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 1 },
  { name: 'Chest', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 2 },
  { name: 'MSK', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 3 },
  { name: 'Neuro', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 4 },
  { name: 'US', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 5 },
  { name: 'IR', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 6 },
  { name: 'Body MRI', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 7 },
  { name: 'Nuclear', kind: 'internal', monthly: true, warnIfEmpty: true, sortOrder: 8 },
  { name: 'Mammography', kind: 'internal', monthly: false, warnIfEmpty: false, sortOrder: 9 },
  { name: VACATION_COVER, kind: 'special', monthly: true, warnIfEmpty: false, sortOrder: 20 },
  { name: POST_CALL, kind: 'special', monthly: true, warnIfEmpty: false, sortOrder: 21 },
  { name: 'Vascular', kind: 'external', monthly: true, warnIfEmpty: false, sortOrder: 30 },
  { name: 'Elective', kind: 'external', monthly: true, warnIfEmpty: false, sortOrder: 31 },
];

/** Everything the rule engine needs. */
export interface ScheduleData {
  residents: Resident[];
  rotations: Rotation[];
  /** residentId -> month -> rotation name */
  monthly: Record<string, Record<MonthKey, string>>;
  vacations: Vacation[];
  /** date -> on-call residentId */
  calls: Record<ISODate, string>;
  /** Admin choice when several residents are on vacation: date -> residentId whose rotation is covered */
  coverChoices: Record<ISODate, string>;
  /** Manual per-day overrides: date -> residentId -> assignment ("Off" = day off) */
  overrides: Record<ISODate, Record<string, string>>;
  settings: Settings;
}

export type ResidentStatus =
  | 'working' // on a department rotation (possibly covering someone)
  | 'vacation'
  | 'post-call' // off after yesterday's call
  | 'external' // off-site rotation
  | 'off' // weekend/holiday or manually set off
  | 'unassigned'; // no monthly assignment

export interface ResidentDay {
  residentId: string;
  /** The resident's monthly assignment (as in the Monthly Schedule sheet). */
  monthly: string | null;
  status: ResidentStatus;
  /** Effective rotation for the day (null when not working). */
  assignment: string | null;
  /** Set when this resident is replacing someone today. */
  coveringFor?: string;
  /** Set when someone else is doing this resident's rotation today. */
  coveredBy?: string;
  onCall: boolean;
  manual?: boolean;
}

export type Severity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'rotation-over-capacity'
  | 'rotation-empty'
  | 'vacation-and-call'
  | 'consecutive-calls'
  | 'no-vacation-cover'
  | 'no-post-call'
  | 'vacation-cover-conflict'
  | 'vacation-uncovered'
  | 'post-call-external'
  | 'post-call-on-vacation'
  | 'post-call-self'
  | 'post-call-uncovered'
  | 'external-on-call'
  | 'inactive-on-call'
  | 'unknown-resident'
  | 'unknown-rotation'
  | 'unassigned'
  | 'no-call';

export interface Issue {
  severity: Severity;
  code: IssueCode;
  message: string;
  date?: ISODate;
  month?: MonthKey;
  residentIds?: string[];
  rotation?: string;
  /** True when the admin can resolve it with a per-day choice (cover choice / override). */
  resolvable?: boolean;
}

export interface DaySchedule {
  date: ISODate;
  workingDay: boolean;
  holiday: boolean;
  onCall: string | null;
  /** Resident who is off today because they were on call yesterday. */
  postCall: string | null;
  residents: ResidentDay[];
  /** internal rotation name -> residentIds working on it */
  rotations: Record<string, string[]>;
  /** Residents on vacation that the admin could choose to cover (for the conflict picker). */
  coverCandidates: string[];
  /** Who the Vacation Cover resident is covering (null = default rotation). */
  coveredResident: string | null;
  issues: Issue[];
}
