import { addDays, weekday, type ISODate } from './dates';

/**
 * Call-burden categories, named after the calendar week they normally fall in:
 *  weekday  – Mon–Wed: the post-call day is an ordinary working day
 *  thursday – post-call (Friday) opens onto the weekend
 *  friday   – a working day, but the post-call day is already off (no post-call benefit)
 *  saturday – weekend day followed by another day off (no post-call benefit)
 *  sunday   – weekend day followed by a working day (post-call benefit)
 *
 * Days that are off (holidays, or non-working days set in Settings) shift the equivalents:
 * the category is decided by the days *around* the call, not the weekday name. For example,
 * with Friday off, a Friday call counts as a Saturday, and a Thursday call counts as a Friday.
 */
export type CallType = 'weekday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const CALL_TYPES: CallType[] = ['weekday', 'thursday', 'friday', 'saturday', 'sunday'];

export function callType(date: ISODate, isWorking: (d: ISODate) => boolean): CallType {
  const nextOff = !isWorking(addDays(date, 1));
  if (!isWorking(date)) return nextOff ? 'saturday' : 'sunday';
  if (nextOff) return 'friday';
  return isWorking(addDays(date, 2)) ? 'weekday' : 'thursday';
}

export type MedalKind = 'bronze' | 'silver' | 'golden' | 'diamond';
export const MEDALS: MedalKind[] = ['bronze', 'silver', 'golden', 'diamond'];

export interface WeekendContext {
  calls: Record<ISODate, string>;
  isWorking: (d: ISODate) => boolean;
  onVacation: (residentId: string, d: ISODate) => boolean;
}

/**
 * The weekend benefit a resident gets for the weekend whose Saturday is `sat` (or null).
 *  bronze  – on call Friday; Saturday and Sunday off
 *  silver  – no call Friday, Saturday or Sunday
 *  golden  – post-call on Friday (called Thursday); no call Saturday or Sunday
 *  diamond – golden, plus one more day off: Monday is off, or Friday is off (holiday) and
 *            Thursday is post-call (called Wednesday)
 * The best benefit wins. A resident on vacation on Friday–Sunday gets none.
 */
export function weekendMedal(id: string, sat: ISODate, ctx: WeekendContext): MedalKind | null {
  const wed = addDays(sat, -3);
  const thu = addDays(sat, -2);
  const fri = addDays(sat, -1);
  const sun = addDays(sat, 1);
  const mon = addDays(sat, 2);
  const { calls, isWorking, onVacation } = ctx;
  if ([fri, sat, sun].some((d) => onVacation(id, d))) return null;
  if (calls[sat] === id || calls[sun] === id) return null;

  const calledFri = calls[fri] === id;
  const friWorking = isWorking(fri);
  const postCallFri = friWorking && !calledFri && calls[thu] === id;
  const postCallThuBeforeHoliday = !friWorking && !calledFri && isWorking(thu) && calls[thu] !== id && calls[wed] === id;

  if (postCallFri && !isWorking(mon) && calls[mon] !== id) return 'diamond';
  if (postCallThuBeforeHoliday) return 'diamond';
  if (postCallFri) return 'golden';
  if (calledFri) return 'bronze';
  return 'silver';
}

/**
 * Only weekends whose Friday, Saturday and Sunday calls are all filled in are counted, so future
 * weekends that have not been scheduled yet do not hand everybody a silver.
 */
export function weekendComplete(sat: ISODate, calls: Record<ISODate, string>): boolean {
  return !!(calls[addDays(sat, -1)] && calls[sat] && calls[addDays(sat, 1)]);
}

export interface CallStats {
  total: number;
  /** Calls on days that are off (weekends and holidays). */
  offDays: number;
  byType: Record<CallType, number>;
  medals: Record<MedalKind, number>;
}

const blank = (): CallStats => ({
  total: 0,
  offDays: 0,
  byType: { weekday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 },
  medals: { bronze: 0, silver: 0, golden: 0, diamond: 0 },
});

/** Call and weekend statistics per resident for the dates from..to (inclusive). */
export function callStats(residentIds: string[], from: ISODate, to: ISODate, ctx: WeekendContext): Map<string, CallStats> {
  const out = new Map(residentIds.map((id) => [id, blank()]));
  for (const [d, id] of Object.entries(ctx.calls)) {
    if (d < from || d > to) continue;
    const s = out.get(id);
    if (!s) continue;
    s.total++;
    if (!ctx.isWorking(d)) s.offDays++;
    s.byType[callType(d, ctx.isWorking)]++;
  }
  // Saturdays inside the range
  let sat = from;
  while (weekday(sat) !== 6) sat = addDays(sat, 1);
  for (; sat <= to; sat = addDays(sat, 7)) {
    if (!weekendComplete(sat, ctx.calls)) continue;
    for (const id of residentIds) {
      const m = weekendMedal(id, sat, ctx);
      if (m) out.get(id)!.medals[m]++;
    }
  }
  return out;
}
