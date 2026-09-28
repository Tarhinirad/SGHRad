/**
 * Scheduling rule engine.
 *
 * Starting from each resident's monthly assignment, the effective assignment for a date is
 * computed by applying, in order:
 *   1. Vacation        – residents with a vacation covering the date are "On Vacation".
 *   2. Vacation Cover  – the "Vacation Cover" resident takes over the rotation of the resident
 *                        on vacation; with nobody on vacation they go to Mammography
 *                        (settings.vacationCoverDefault). With more vacationers than cover
 *                        residents, a conflict is raised and the admin's per-day choice
 *                        (coverChoices) decides who is covered; default = earliest vacation start.
 *   3. Post-Call       – yesterday's on-call resident is off today; the "Post-Call" resident takes
 *                        over whatever that resident would have done today. Callers who were on
 *                        an external rotation, on vacation, or who are the Post-Call resident
 *                        themselves are flagged for the admin.
 *   4. External        – residents on external rotations are excluded from the department display.
 *   5. Overrides       – manual per-day overrides set by the admin win over everything.
 *   6. Capacity        – each internal rotation must have 0..maxPerRotation residents; warnings
 *                        for over-capacity and (for rotations with warnIfEmpty) empty rotations.
 *
 * Pure functions only: no I/O, no clock. Dates are ISO strings.
 */
import { addDays, daysInRange, lastOfMonth, firstOfMonth, monthOf, weekday, type ISODate, type MonthKey } from './dates';
import {
  POST_CALL,
  comboParts,
  monthlyOnDay,
  splitParts,
  VACATION_COVER,
  type DaySchedule,
  type Issue,
  type Resident,
  type ResidentDay,
  type Rotation,
  type ScheduleData,
  type Vacation,
} from './types';

export const OFF = 'Off';

export class ScheduleEngine {
  private rotByName = new Map<string, Rotation>();
  private resById = new Map<string, Resident>();
  private vacByRes = new Map<string, Vacation[]>();
  private cache = new Map<ISODate, DaySchedule>();

  constructor(private data: ScheduleData) {
    for (const r of data.rotations) this.rotByName.set(r.name, r);
    for (const r of data.residents) this.resById.set(r.id, r);
    for (const v of data.vacations) {
      const list = this.vacByRes.get(v.residentId) ?? [];
      list.push(v);
      this.vacByRes.set(v.residentId, list);
    }
  }

  name(id: string | null | undefined): string {
    if (!id) return '—';
    return this.resById.get(id)?.name ?? id;
  }

  isWorkingDay(date: ISODate): boolean {
    const s = this.data.settings;
    return s.workingDays.includes(weekday(date)) && !s.holidays.includes(date);
  }

  vacationOn(residentId: string, date: ISODate): Vacation | undefined {
    return this.vacByRes.get(residentId)?.find((v) => v.start <= date && date <= v.end);
  }

  /** Kind of a rotation, or of a combination ("Body+IR"): internal if any part is internal. */
  private kindOf(rotation: string | null | undefined) {
    const kinds = comboParts(rotation).map((p) => this.rotByName.get(p)?.kind);
    if (kinds.includes('internal')) return 'internal';
    return kinds[0];
  }

  private orderOf(value: string | null | undefined) {
    return Math.min(...comboParts(value).map((p) => this.rotByName.get(p)?.sortOrder ?? 999));
  }

  day(date: ISODate): DaySchedule {
    const cached = this.cache.get(date);
    if (cached) return cached;
    const result = this.computeDay(date);
    this.cache.set(date, result);
    return result;
  }

  range(from: ISODate, to: ISODate): DaySchedule[] {
    return daysInRange(from, to).map((d) => this.day(d));
  }

  private computeDay(date: ISODate): DaySchedule {
    const { settings: s, calls, coverChoices, overrides } = this.data;
    const month = monthOf(date);
    const holiday = s.holidays.includes(date);
    const workingDay = this.isWorkingDay(date);
    const onCall = calls[date] ?? null;
    const issues: Issue[] = [];
    const days = new Map<string, ResidentDay>();

    // --- Base: monthly assignment -------------------------------------------------------
    for (const r of this.data.residents) {
      if (!r.active) continue;
      // Split months ("Body/IR"): first half the first rotation, second half the second.
      const monthly = monthlyOnDay(this.data.monthly[r.id]?.[month], Number(date.slice(8, 10)), s.splitDay);
      const kind = this.kindOf(monthly);
      const d: ResidentDay = { residentId: r.id, monthly, status: 'working', assignment: null, onCall: r.id === onCall };
      if (!monthly) d.status = 'unassigned';
      else if (kind === 'external') {
        d.status = 'external';
        d.assignment = monthly;
      } else if (!workingDay) d.status = 'off';
      else if (kind === 'special') d.assignment = null; // resolved below
      else d.assignment = monthly; // internal (or unknown value – reported by month validation)
      days.set(r.id, d);
    }

    // --- Rule 1: vacation ----------------------------------------------------------------
    const vacationers: ResidentDay[] = [];
    for (const d of days.values()) {
      if (this.vacationOn(d.residentId, date)) {
        d.status = 'vacation';
        d.assignment = null;
        vacationers.push(d);
      }
    }

    let postCall: string | null = null;
    let coverCandidates: string[] = [];
    let coveredResident: string | null = null;
    const byMonthly = (role: string) => [...days.values()].filter((d) => d.monthly === role);
    const prev = addDays(date, -1);
    const caller = calls[prev];
    const callerDay = caller ? days.get(caller) : undefined;

    if (workingDay) {
      // --- Rule 2: vacation cover ----------------------------------------------------------
      const covers = byMonthly(VACATION_COVER).filter((d) => d.status === 'working');
      const coverable = vacationers
        .filter((d) => this.kindOf(d.monthly) === 'internal')
        .sort((a, b) => {
          const va = this.vacationOn(a.residentId, date)!.start;
          const vb = this.vacationOn(b.residentId, date)!.start;
          if (va !== vb) return va < vb ? -1 : 1;
          const oa = this.orderOf(a.monthly);
          const ob = this.orderOf(b.monthly);
          if (oa !== ob) return oa - ob;
          return this.name(a.residentId).localeCompare(this.name(b.residentId));
        });
      coverCandidates = coverable.map((d) => d.residentId);
      const choice = coverChoices[date];
      const queue = [...coverable];
      const chosenIdx = queue.findIndex((d) => d.residentId === choice);
      if (chosenIdx > 0) queue.unshift(...queue.splice(chosenIdx, 1));

      for (const c of covers) {
        const target = queue.shift();
        if (target) {
          c.assignment = target.monthly;
          c.coveringFor = target.residentId;
          target.coveredBy = c.residentId;
          coveredResident ??= target.residentId;
        } else {
          c.assignment = s.vacationCoverDefault;
        }
      }
      if (queue.length > 0) {
        const uncovered = queue.map((d) => `${this.name(d.residentId)} (${d.monthly})`).join(', ');
        if (covers.length === 0) {
          const vcOnVacation = byMonthly(VACATION_COVER).some((d) => d.status === 'vacation');
          issues.push({
            severity: 'warning',
            code: 'vacation-uncovered',
            date,
            message: vcOnVacation
              ? `Vacation Cover resident is on vacation; not covered: ${uncovered}`
              : `No Vacation Cover resident available; not covered: ${uncovered}`,
            residentIds: queue.map((d) => d.residentId),
          });
        } else {
          issues.push({
            severity: 'warning',
            code: 'vacation-cover-conflict',
            date,
            resolvable: true,
            message:
              `${coverable.length} residents on vacation but only ${covers.length} Vacation Cover. ` +
              `${covers.map((c) => `${this.name(c.residentId)} covers ${this.name(c.coveringFor)}`).join('; ')}` +
              `${choice && chosenIdx >= 0 ? ' (admin choice)' : ' (default: earliest vacation)'}. Not covered: ${uncovered}`,
            residentIds: coverable.map((d) => d.residentId),
          });
        }
      }

      // --- Rule 3: post-call -----------------------------------------------------------------
      const postCallApplies = caller && (s.postCallAfterNonWorkingDay || this.isWorkingDay(prev));
      const pcResidents = byMonthly(POST_CALL).filter((d) => d.status === 'working');
      if (postCallApplies && callerDay) {
        postCall = callerDay.residentId;
        const callerName = this.name(callerDay.residentId);
        if (callerDay.status === 'vacation') {
          issues.push({
            severity: 'info',
            code: 'post-call-on-vacation',
            date,
            message: `${callerName} was on call yesterday and is on vacation today (no post-call replacement needed).`,
            residentIds: [callerDay.residentId],
          });
        } else if (callerDay.status === 'external') {
          callerDay.status = 'post-call';
          callerDay.assignment = null;
          issues.push({
            severity: 'warning',
            code: 'post-call-external',
            date,
            resolvable: true,
            message: `${callerName} was on call yesterday while on external rotation ${callerDay.monthly}; post-call day off from an external rotation – no department rotation to replace.`,
            residentIds: [callerDay.residentId],
          });
        } else {
          const takenOver = callerDay.assignment;
          const coveringFor = callerDay.coveringFor;
          callerDay.status = 'post-call';
          callerDay.assignment = null;
          callerDay.coveringFor = undefined;
          if (callerDay.monthly === POST_CALL) {
            issues.push({
              severity: 'warning',
              code: 'post-call-self',
              date,
              resolvable: true,
              message: `${callerName} (the Post-Call resident this month) was on call yesterday and is off today; nobody is available as Post-Call replacement.`,
              residentIds: [callerDay.residentId],
            });
          } else {
            const pc = pcResidents.find((d) => d.residentId !== callerDay.residentId);
            if (!pc) {
              if (takenOver && this.kindOf(takenOver) === 'internal') {
                const pcOnVac = byMonthly(POST_CALL).some((d) => d.status === 'vacation');
                issues.push({
                  severity: 'warning',
                  code: 'post-call-uncovered',
                  date,
                  resolvable: true,
                  rotation: takenOver,
                  message: `${callerName} is post-call; ${pcOnVac ? 'the Post-Call resident is on vacation' : 'no Post-Call resident assigned'} so ${takenOver} loses a resident.`,
                  residentIds: [callerDay.residentId],
                });
              }
            } else {
              pc.assignment = takenOver ?? s.postCallIdleRotation;
              if (takenOver) {
                pc.coveringFor = callerDay.residentId;
                callerDay.coveredBy = pc.residentId;
                if (coveringFor) {
                  const v = days.get(coveringFor);
                  if (v) v.coveredBy = pc.residentId;
                }
              }
            }
          }
        }
      }
      for (const pc of pcResidents) if (pc.status === 'working' && !pc.assignment) pc.assignment = s.postCallIdleRotation;
    } else if (callerDay && callerDay.status === 'off') {
      // Weekend / holiday: informative only.
      postCall = callerDay.residentId;
      callerDay.status = 'post-call';
    }

    // --- Rule 5: manual overrides --------------------------------------------------------
    for (const [rid, value] of Object.entries(overrides[date] ?? {})) {
      const d = days.get(rid);
      if (!d || !value) continue;
      for (const other of days.values()) {
        if (other.coveredBy === rid) other.coveredBy = undefined;
      }
      d.coveringFor = undefined;
      d.manual = true;
      if (value === OFF) {
        d.status = 'off';
        d.assignment = null;
      } else {
        d.status = this.kindOf(value) === 'external' ? 'external' : 'working';
        d.assignment = value;
      }
    }

    // --- Rule 4 + 6: department display and capacity -------------------------------------
    const rotations: Record<string, string[]> = {};
    const internal = this.data.rotations.filter((r) => r.kind === 'internal').sort((a, b) => a.sortOrder - b.sortOrder);
    for (const r of internal) rotations[r.name] = [];
    if (workingDay) {
      for (const d of days.values()) {
        if (d.status !== 'working' || !d.assignment) continue;
        // A resident covering several rotations ("Body+IR") appears on each of them.
        for (const part of comboParts(d.assignment)) {
          const k = this.rotByName.get(part)?.kind;
          if (k === 'external' || k === 'special') continue;
          (rotations[part] ??= []).push(d.residentId);
        }
      }
      for (const r of internal) {
        const n = rotations[r.name].length;
        if (n > s.maxPerRotation) {
          issues.push({
            severity: 'warning',
            code: 'rotation-over-capacity',
            date,
            rotation: r.name,
            message: `${r.name} has ${n} residents (max ${s.maxPerRotation}).`,
            residentIds: rotations[r.name],
          });
        } else if (n === 0 && r.warnIfEmpty) {
          issues.push({ severity: 'warning', code: 'rotation-empty', date, rotation: r.name, message: `${r.name} has no resident.` });
        }
      }
    }

    // --- Call checks -----------------------------------------------------------------------
    issues.push(...this.callIssues(date, days));

    return {
      date,
      workingDay,
      holiday,
      onCall,
      postCall,
      residents: [...days.values()],
      rotations,
      coverCandidates,
      coveredResident,
      issues,
    };
  }

  private callIssues(date: ISODate, days: Map<string, ResidentDay>): Issue[] {
    const { calls, settings: s } = this.data;
    const out: Issue[] = [];
    const id = calls[date];
    if (!id) {
      out.push({ severity: 'info', code: 'no-call', date, message: 'No on-call resident assigned.' });
      return out;
    }
    const res = this.resById.get(id);
    if (!res) {
      out.push({ severity: 'error', code: 'unknown-resident', date, message: `On-call resident "${id}" does not exist.`, residentIds: [id] });
      return out;
    }
    if (!res.active) {
      out.push({ severity: 'warning', code: 'inactive-on-call', date, message: `${res.name} is on call but is inactive.`, residentIds: [id] });
    }
    if (this.vacationOn(id, date)) {
      out.push({ severity: 'error', code: 'vacation-and-call', date, message: `${res.name} is on call while on vacation.`, residentIds: [id] });
    }
    if (!s.allowConsecutiveCalls && calls[addDays(date, -1)] === id) {
      out.push({ severity: 'warning', code: 'consecutive-calls', date, message: `${res.name} is on call two days in a row.`, residentIds: [id] });
    }
    const d = days.get(id);
    if (!s.externalEligibleForCalls && d && this.kindOf(d.monthly) === 'external') {
      out.push({
        severity: 'warning',
        code: 'external-on-call',
        date,
        message: `${res.name} is on call while on external rotation ${d.monthly}.`,
        residentIds: [id],
      });
    }
    return out;
  }

  /** Month-level checks: Vacation Cover / Post-Call presence, unknown values, unassigned residents. */
  monthIssues(month: MonthKey): Issue[] {
    const out: Issue[] = [];
    const active = this.data.residents.filter((r) => r.active);
    const split = this.data.settings.splitDay;
    const values = active.map((r) => ({ r, v: this.data.monthly[r.id]?.[month] || '' }));
    const anySplit = values.some((x) => splitParts(x.v).length > 1);
    // With split months, check each half separately.
    const halves = anySplit
      ? [
          { day: 1, label: ` (days 1–${split})` },
          { day: split + 1, label: ` (days ${split + 1}–end)` },
        ]
      : [{ day: 1, label: '' }];
    for (const h of halves) {
      const on = values.map((x) => monthlyOnDay(x.v, h.day, split));
      if (!on.includes(VACATION_COVER))
        out.push({ severity: 'warning', code: 'no-vacation-cover', month, message: `No Vacation Cover resident assigned${h.label}.` });
      if (!on.includes(POST_CALL)) out.push({ severity: 'warning', code: 'no-post-call', month, message: `No Post-Call resident assigned${h.label}.` });
    }
    for (const { r, v } of values) {
      const parts = splitParts(v);
      if (parts.length === 0) {
        out.push({ severity: 'warning', code: 'unassigned', month, message: `${r.name} has no assignment.`, residentIds: [r.id] });
        continue;
      }
      if (parts.length > 2)
        out.push({ severity: 'error', code: 'unknown-rotation', month, message: `${r.name}: "${v}" – a month can be split into at most two rotations.`, residentIds: [r.id], rotation: v });
      for (const half of parts) {
        const combo = comboParts(half);
        for (const p of combo)
          if (!this.rotByName.has(p))
            out.push({ severity: 'error', code: 'unknown-rotation', month, message: `${r.name}: unknown rotation "${p}".`, residentIds: [r.id], rotation: p });
        if (combo.length > 1 && combo.some((p) => this.rotByName.get(p)?.kind === 'special'))
          out.push({
            severity: 'error',
            code: 'unknown-rotation',
            month,
            message: `${r.name}: "${half}" – Vacation Cover and Post-Call cannot be combined with other rotations.`,
            residentIds: [r.id],
            rotation: half,
          });
      }
    }
    return out;
  }

  /** All issues (month-level + daily) for the months overlapping [from, to]. */
  issues(from: ISODate, to: ISODate): Issue[] {
    const out: Issue[] = [];
    for (let m = monthOf(from); m <= monthOf(to); m = monthOf(addDays(lastOfMonth(m), 1))) {
      out.push(...this.monthIssues(m));
      const start = firstOfMonth(m) < from ? from : firstOfMonth(m);
      const end = lastOfMonth(m) > to ? to : lastOfMonth(m);
      for (const d of this.range(start, end)) out.push(...d.issues);
    }
    return out;
  }
}

/**
 * Who is on call at a given moment. A call listed for date D runs from D at `callStartHour`
 * until D+1 at `callStartHour`, so before that hour the previous day's resident is still on call.
 */
export function onCallAt(
  calls: Record<ISODate, string>,
  date: ISODate,
  hour: number,
  callStartHour: number,
): { current: string | null; currentSince: ISODate; next: string | null; nextFrom: ISODate } {
  const shiftDate = hour < callStartHour ? addDays(date, -1) : date;
  const nextDate = addDays(shiftDate, 1);
  return { current: calls[shiftDate] ?? null, currentSince: shiftDate, next: calls[nextDate] ?? null, nextFrom: nextDate };
}

export function computeDay(data: ScheduleData, date: ISODate): DaySchedule {
  return new ScheduleEngine(data).day(date);
}
