import { describe, expect, it } from 'vitest';
import { ScheduleEngine, computeDay, onCallAt } from '../src/engine';
import type { DaySchedule } from '../src/types';
import { MON, MONTH, NEXT_MON, SAT, SUN, TUE, WED, makeData, res } from './fixtures';

const who = (day: DaySchedule, id: string) => day.residents.find((r) => r.residentId === id)!;
const codes = (day: DaySchedule) => day.issues.map((i) => i.code);

describe('base monthly assignment', () => {
  it('places each resident on their monthly rotation on a working day', () => {
    const day = computeDay(makeData(), TUE);
    expect(day.workingDay).toBe(true);
    expect(day.rotations['Body']).toEqual(['A']);
    expect(day.rotations['Nuclear']).toEqual(['H']);
    expect(who(day, 'A')).toMatchObject({ status: 'working', assignment: 'Body' });
  });

  it('marks everyone off on weekends and does not check capacity', () => {
    const day = computeDay(makeData(), SAT);
    expect(day.workingDay).toBe(false);
    expect(who(day, 'A').status).toBe('off');
    expect(codes(day)).not.toContain('rotation-empty');
  });

  it('treats configured holidays as non-working days', () => {
    const day = computeDay(makeData({ settings: { holidays: [TUE] } }), TUE);
    expect(day.workingDay).toBe(false);
    expect(day.holiday).toBe(true);
    expect(who(day, 'B').status).toBe('off');
  });

  it('honours custom working days (e.g. Saturday)', () => {
    const day = computeDay(makeData({ settings: { workingDays: [1, 2, 3, 4, 5, 6] } }), SAT);
    expect(day.workingDay).toBe(true);
    expect(day.rotations['Chest']).toEqual(['B']);
  });

  it('ignores inactive residents', () => {
    const d = makeData();
    d.residents.find((r) => r.id === 'A')!.active = false;
    const day = computeDay(d, TUE);
    expect(day.residents.find((r) => r.residentId === 'A')).toBeUndefined();
    expect(codes(day)).toContain('rotation-empty');
  });

  it('marks residents without an assignment as unassigned', () => {
    const d = makeData();
    d.residents.push(res('Z'));
    expect(who(computeDay(d, TUE), 'Z').status).toBe('unassigned');
  });
});

describe('rule 1 + 2: vacation and vacation cover', () => {
  it('sends Vacation Cover to Mammography when nobody is on vacation', () => {
    const day = computeDay(makeData(), TUE);
    expect(who(day, 'VC')).toMatchObject({ status: 'working', assignment: 'Mammography' });
    expect(day.rotations['Mammography']).toEqual(['VC', 'PC']); // Post-Call idle too
    expect(day.coveredResident).toBeNull();
  });

  it('uses the configured default rotation for Vacation Cover', () => {
    const day = computeDay(makeData({ settings: { vacationCoverDefault: 'US' } }), TUE);
    expect(who(day, 'VC').assignment).toBe('US');
  });

  it('marks a resident on vacation and has Vacation Cover take their rotation', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'B', start: MON, end: WED });
    const day = computeDay(d, TUE);
    expect(who(day, 'B')).toMatchObject({ status: 'vacation', assignment: null, coveredBy: 'VC' });
    expect(who(day, 'VC')).toMatchObject({ assignment: 'Chest', coveringFor: 'B' });
    expect(day.rotations['Chest']).toEqual(['VC']);
    expect(day.rotations['Mammography']).toEqual(['PC']);
    expect(day.coveredResident).toBe('B');
  });

  it('vacation dates are inclusive', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'B', start: TUE, end: TUE });
    const e = new ScheduleEngine(d);
    expect(who(e.day(MON), 'B').status).toBe('working');
    expect(who(e.day(TUE), 'B').status).toBe('vacation');
    expect(who(e.day(WED), 'B').status).toBe('working');
  });

  it('shows vacation on weekends too', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'B', start: SAT, end: SUN });
    expect(who(computeDay(d, SAT), 'B').status).toBe('vacation');
  });

  it('raises a resolvable conflict when two residents are on vacation; default covers earliest vacation', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'C', start: MON, end: WED });
    d.vacations.push({ residentId: 'B', start: TUE, end: WED });
    const day = computeDay(d, TUE);
    const issue = day.issues.find((i) => i.code === 'vacation-cover-conflict');
    expect(issue).toBeDefined();
    expect(issue!.resolvable).toBe(true);
    expect(day.coverCandidates).toEqual(['C', 'B']);
    expect(who(day, 'VC')).toMatchObject({ assignment: 'MSK', coveringFor: 'C' });
    expect(who(day, 'B').coveredBy).toBeUndefined();
    expect(day.rotations['Chest']).toEqual([]);
  });

  it('breaks default ties by rotation order', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'C', start: MON, end: WED }); // MSK (order 3)
    d.vacations.push({ residentId: 'B', start: MON, end: WED }); // Chest (order 2)
    expect(computeDay(d, TUE).coverCandidates).toEqual(['B', 'C']);
  });

  it("applies the admin's cover choice", () => {
    const d = makeData();
    d.vacations.push({ residentId: 'C', start: MON, end: WED });
    d.vacations.push({ residentId: 'B', start: TUE, end: WED });
    d.coverChoices[TUE] = 'B';
    const day = computeDay(d, TUE);
    expect(who(day, 'VC')).toMatchObject({ assignment: 'Chest', coveringFor: 'B' });
    expect(day.issues.find((i) => i.code === 'vacation-cover-conflict')!.message).toContain('admin choice');
  });

  it('ignores a cover choice that is not on vacation that day', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'C', start: MON, end: WED });
    d.coverChoices[TUE] = 'A';
    expect(who(computeDay(d, TUE), 'VC').coveringFor).toBe('C');
  });

  it('two Vacation Cover residents can cover two vacations without conflict', () => {
    const d = makeData({ monthly: { E: 'Vacation Cover' } });
    d.vacations.push({ residentId: 'B', start: MON, end: WED });
    d.vacations.push({ residentId: 'C', start: MON, end: WED });
    const day = computeDay(d, TUE);
    expect(codes(day)).not.toContain('vacation-cover-conflict');
    expect(day.rotations['Chest']).toHaveLength(1);
    expect(day.rotations['MSK']).toHaveLength(1);
  });

  it('does not "cover" residents on vacation from an external or special rotation', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'X', start: MON, end: WED });
    d.vacations.push({ residentId: 'PC', start: MON, end: WED });
    const day = computeDay(d, TUE);
    expect(who(day, 'VC').assignment).toBe('Mammography');
    expect(codes(day)).not.toContain('vacation-cover-conflict');
  });

  it('flags uncovered vacation when the Vacation Cover resident is also on vacation', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'VC', start: MON, end: WED });
    d.vacations.push({ residentId: 'B', start: MON, end: WED });
    const day = computeDay(d, TUE);
    const issue = day.issues.find((i) => i.code === 'vacation-uncovered');
    expect(issue?.message).toMatch(/on vacation/);
    expect(codes(day)).toContain('rotation-empty');
  });

  it('flags uncovered vacation when no Vacation Cover is assigned', () => {
    const d = makeData({ monthly: { VC: 'Body' } });
    d.vacations.push({ residentId: 'B', start: MON, end: WED });
    expect(codes(computeDay(d, TUE))).toContain('vacation-uncovered');
  });
});

describe('rule 3: post-call', () => {
  it('makes yesterday’s on-call resident off and the Post-Call resident takes their rotation', () => {
    const d = makeData();
    d.calls[MON] = 'A';
    const day = computeDay(d, TUE);
    expect(day.postCall).toBe('A');
    expect(who(day, 'A')).toMatchObject({ status: 'post-call', assignment: null, coveredBy: 'PC' });
    expect(who(day, 'PC')).toMatchObject({ status: 'working', assignment: 'Body', coveringFor: 'A' });
    expect(day.rotations['Body']).toEqual(['PC']);
  });

  it('sends the Post-Call resident to the idle rotation when nobody was on call', () => {
    const day = computeDay(makeData(), TUE);
    expect(day.postCall).toBeNull();
    expect(who(day, 'PC').assignment).toBe('Mammography');
  });

  it('uses the configured idle rotation for Post-Call', () => {
    const day = computeDay(makeData({ settings: { postCallIdleRotation: 'Body' } }), TUE);
    expect(who(day, 'PC').assignment).toBe('Body');
  });

  it('when the caller was the Vacation Cover, Post-Call takes over the covered rotation', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'B', start: MON, end: WED });
    d.calls[MON] = 'VC';
    const day = computeDay(d, TUE);
    expect(who(day, 'VC').status).toBe('post-call');
    expect(who(day, 'PC')).toMatchObject({ assignment: 'Chest', coveringFor: 'VC' });
    expect(who(day, 'B').coveredBy).toBe('PC');
    expect(day.rotations['Chest']).toEqual(['PC']);
  });

  it('when the caller was the Vacation Cover with nobody on vacation, Post-Call goes to Mammography', () => {
    const d = makeData();
    d.calls[MON] = 'VC';
    const day = computeDay(d, TUE);
    expect(who(day, 'PC').assignment).toBe('Mammography');
    expect(day.rotations['Mammography']).toEqual(['PC']);
  });

  it('flags a caller who was on an external rotation', () => {
    const d = makeData();
    d.calls[MON] = 'X';
    const day = computeDay(d, TUE);
    expect(who(day, 'X').status).toBe('post-call');
    const issue = day.issues.find((i) => i.code === 'post-call-external');
    expect(issue).toMatchObject({ severity: 'warning', resolvable: true });
    expect(who(day, 'PC').assignment).toBe('Mammography');
  });

  it('notes (info) a caller who is on vacation today; no replacement', () => {
    const d = makeData();
    d.calls[MON] = 'A';
    d.vacations.push({ residentId: 'A', start: TUE, end: WED });
    const day = computeDay(d, TUE);
    expect(who(day, 'A').status).toBe('vacation');
    expect(day.issues.find((i) => i.code === 'post-call-on-vacation')?.severity).toBe('info');
    // Vacation Cover handles the vacation; Post-Call is idle
    expect(who(day, 'VC').assignment).toBe('Body');
    expect(who(day, 'PC').assignment).toBe('Mammography');
  });

  it('is not a problem when the caller is the Post-Call resident: they are simply off', () => {
    const d = makeData();
    d.calls[MON] = 'PC';
    const day = computeDay(d, TUE);
    expect(who(day, 'PC').status).toBe('post-call');
    expect(who(day, 'PC').assignment).toBeNull();
    expect(day.postCall).toBe('PC');
    // Nobody is pulled in to cover, and no warning is raised.
    expect(day.issues.filter((i) => i.severity !== 'info')).toEqual([]);
    expect(day.rotations['Body']).toEqual(['A']);
  });

  it('flags when the Post-Call resident is on vacation', () => {
    const d = makeData();
    d.calls[MON] = 'A';
    d.vacations.push({ residentId: 'PC', start: MON, end: WED });
    const day = computeDay(d, TUE);
    const issue = day.issues.find((i) => i.code === 'post-call-uncovered');
    expect(issue?.message).toMatch(/on vacation/);
    expect(day.rotations['Body']).toEqual([]);
    expect(codes(day)).toContain('rotation-empty');
  });

  it('flags when no Post-Call resident is assigned', () => {
    const d = makeData({ monthly: { PC: 'Body' } });
    d.calls[MON] = 'B';
    const day = computeDay(d, TUE);
    expect(day.issues.find((i) => i.code === 'post-call-uncovered')?.message).toMatch(/no Post-Call/);
  });

  it('applies after a Sunday call (Monday post-call) by default', () => {
    const d = makeData();
    d.calls[SUN] = 'C';
    const day = computeDay(d, NEXT_MON);
    expect(who(day, 'C').status).toBe('post-call');
    expect(who(day, 'PC').assignment).toBe('MSK');
  });

  it('does not apply after a weekend call when postCallAfterNonWorkingDay = false', () => {
    const d = makeData({ settings: { postCallAfterNonWorkingDay: false } });
    d.calls[SUN] = 'C';
    const day = computeDay(d, NEXT_MON);
    expect(who(day, 'C')).toMatchObject({ status: 'working', assignment: 'MSK' });
    expect(day.postCall).toBeNull();
  });

  it('on a weekend the post-call resident is shown as post-call (informative)', () => {
    const d = makeData();
    d.calls['2026-09-11'] = 'C';
    const day = computeDay(d, SAT);
    expect(day.postCall).toBe('C');
    expect(who(day, 'C').status).toBe('post-call');
  });

  it('crosses month boundaries (call on the last day of the month)', () => {
    const d = makeData();
    d.monthly['A']['2026-10'] = 'Chest';
    d.monthly['PC']['2026-10'] = 'Post-Call';
    d.calls['2026-09-30'] = 'A'; // Wednesday
    const day = computeDay(d, '2026-10-01');
    expect(who(day, 'A').status).toBe('post-call');
    expect(who(day, 'PC').assignment).toBe('Chest');
  });
});

describe('rule 4: external rotations', () => {
  it('excludes external residents from the department display', () => {
    const day = computeDay(makeData(), TUE);
    expect(who(day, 'X')).toMatchObject({ status: 'external', assignment: 'Vascular' });
    expect(Object.values(day.rotations).flat()).not.toContain('X');
    expect(day.rotations['Vascular']).toBeUndefined();
  });

  it('supports newly added external rotations', () => {
    const d = makeData({ monthly: { X: 'Research' } });
    d.rotations.push({ name: 'Research', kind: 'external', monthly: true, warnIfEmpty: false, sortOrder: 40 });
    expect(who(computeDay(d, TUE), 'X').status).toBe('external');
  });

  it('allows external residents on call by default', () => {
    const d = makeData();
    d.calls[TUE] = 'X';
    expect(codes(computeDay(d, TUE))).not.toContain('external-on-call');
  });

  it('warns about external residents on call when not eligible', () => {
    const d = makeData({ settings: { externalEligibleForCalls: false } });
    d.calls[TUE] = 'X';
    expect(codes(computeDay(d, TUE))).toContain('external-on-call');
  });
});

describe('rule 5: manual overrides', () => {
  it('overrides an effective assignment', () => {
    const d = makeData();
    d.overrides[TUE] = { A: 'Chest' };
    const day = computeDay(d, TUE);
    expect(who(day, 'A')).toMatchObject({ assignment: 'Chest', manual: true });
    expect([...day.rotations['Chest']].sort()).toEqual(['A', 'B']);
  });

  it('can set a resident off', () => {
    const d = makeData();
    d.overrides[TUE] = { A: 'Off' };
    const day = computeDay(d, TUE);
    expect(who(day, 'A').status).toBe('off');
    expect(codes(day)).toContain('rotation-empty');
  });

  it('resolves a post-call conflict by assigning the Post-Call resident', () => {
    const d = makeData();
    d.calls[MON] = 'X';
    d.overrides[TUE] = { PC: 'Neuro' };
    expect(who(computeDay(d, TUE), 'PC').assignment).toBe('Neuro');
  });

  it('clears coverage links pointing at an overridden resident', () => {
    const d = makeData();
    d.vacations.push({ residentId: 'B', start: MON, end: WED });
    d.overrides[TUE] = { VC: 'US' };
    const day = computeDay(d, TUE);
    expect(who(day, 'B').coveredBy).toBeUndefined();
    expect(who(day, 'VC').coveringFor).toBeUndefined();
  });
});

describe('rule 6: capacity', () => {
  it('allows up to 3 residents on a rotation', () => {
    const d = makeData({ monthly: { C: 'Body', D: 'Body' } });
    const day = computeDay(d, TUE);
    expect(day.rotations['Body']).toHaveLength(3);
    expect(codes(day)).not.toContain('rotation-over-capacity');
  });

  it('warns above 3 residents', () => {
    const d = makeData({ monthly: { B: 'Body', C: 'Body', D: 'Body' } });
    const issue = computeDay(d, TUE).issues.find((i) => i.code === 'rotation-over-capacity');
    expect(issue).toMatchObject({ rotation: 'Body' });
  });

  it('counts substitutions (Vacation Cover pushes a rotation over capacity)', () => {
    const d = makeData({ monthly: { B: 'Body', C: 'Body', D: 'Body' } });
    d.overrides[TUE] = { D: 'Chest' };
    d.vacations.push({ residentId: 'E', start: TUE, end: TUE });
    // Body 3 (A,B,C) – fine. Move VC onto Body by override to exceed:
    d.overrides[TUE].VC = 'Body';
    expect(codes(computeDay(d, TUE))).toContain('rotation-over-capacity');
  });

  it('respects a custom maximum', () => {
    const d = makeData({ monthly: { C: 'Body' }, settings: { maxPerRotation: 1 } });
    expect(codes(computeDay(d, TUE))).toContain('rotation-over-capacity');
  });

  it('warns when a rotation is left empty after substitutions', () => {
    const d = makeData({ monthly: { VC: 'Body' } });
    d.vacations.push({ residentId: 'H', start: TUE, end: TUE });
    const day = computeDay(d, TUE);
    expect(day.issues.find((i) => i.code === 'rotation-empty')?.rotation).toBe('Nuclear');
  });

  it('does not warn for empty Mammography', () => {
    const d = makeData({ monthly: { VC: 'Body', PC: 'Chest' } });
    const day = computeDay(d, TUE);
    expect(day.rotations['Mammography']).toEqual([]);
    expect(day.issues.filter((i) => i.code === 'rotation-empty')).toHaveLength(0);
  });
});

describe('call validation', () => {
  it('errors when the on-call resident is on vacation', () => {
    const d = makeData();
    d.calls[TUE] = 'A';
    d.vacations.push({ residentId: 'A', start: TUE, end: TUE });
    expect(computeDay(d, TUE).issues.find((i) => i.code === 'vacation-and-call')?.severity).toBe('error');
  });

  it('warns about consecutive calls unless allowed', () => {
    const d = makeData();
    d.calls[MON] = 'A';
    d.calls[TUE] = 'A';
    expect(codes(computeDay(d, TUE))).toContain('consecutive-calls');
    d.settings.allowConsecutiveCalls = true;
    expect(codes(computeDay(d, TUE))).not.toContain('consecutive-calls');
  });

  it('flags unknown and inactive on-call residents', () => {
    const d = makeData();
    d.calls[TUE] = 'NOPE';
    d.calls[WED] = 'A';
    d.residents.find((r) => r.id === 'A')!.active = false;
    const e = new ScheduleEngine(d);
    expect(codes(e.day(TUE))).toContain('unknown-resident');
    expect(codes(e.day(WED))).toContain('inactive-on-call');
  });

  it('notes days without an on-call resident', () => {
    expect(computeDay(makeData(), TUE).issues.find((i) => i.code === 'no-call')?.severity).toBe('info');
  });

  it('marks the on-call resident in the day', () => {
    const d = makeData();
    d.calls[TUE] = 'E';
    const day = computeDay(d, TUE);
    expect(day.onCall).toBe('E');
    expect(who(day, 'E').onCall).toBe(true);
  });
});

describe('month validation', () => {
  it('warns when no Vacation Cover or Post-Call is assigned in a month', () => {
    const e = new ScheduleEngine(makeData({ monthly: { VC: 'Body', PC: 'Chest' } }));
    const c = e.monthIssues(MONTH).map((i) => i.code);
    expect(c).toContain('no-vacation-cover');
    expect(c).toContain('no-post-call');
  });

  it('reports unknown rotation values and unassigned residents', () => {
    const d = makeData({ monthly: { A: 'Cardiac', B: '' } });
    const c = new ScheduleEngine(d).monthIssues(MONTH).map((i) => i.code);
    expect(c).toContain('unknown-rotation');
    expect(c).toContain('unassigned');
  });

  it('collects month and daily issues over a range', () => {
    const d = makeData({ monthly: { PC: 'Chest' } });
    d.vacations.push({ residentId: 'A', start: MON, end: MON });
    d.calls[MON] = 'A';
    const issues = new ScheduleEngine(d).issues(MON, TUE);
    expect(issues.some((i) => i.code === 'no-post-call' && i.month === MONTH)).toBe(true);
    expect(issues.some((i) => i.code === 'vacation-and-call' && i.date === MON)).toBe(true);
  });
});


describe('split months ("Body/IR")', () => {
  // A: Body first half, IR second half; F: IR first half, Body second half → each rotation stays covered.
  const split = () => makeData({ monthly: { A: 'Body/IR', F: 'IR/Body' } });

  it('uses the first rotation up to the split day and the second after it', () => {
    const e = new ScheduleEngine(split());
    const d15 = e.day('2026-09-15');
    const d16 = e.day('2026-09-16');
    expect(who(d15, 'A')).toMatchObject({ assignment: 'Body', monthly: 'Body' });
    expect(who(d16, 'A')).toMatchObject({ assignment: 'IR', monthly: 'IR' });
    expect(d15.rotations['Body']).toEqual(['A']);
    expect(d15.rotations['IR']).toEqual(['F']);
    expect(d16.rotations['Body']).toEqual(['F']);
    expect(d16.rotations['IR']).toEqual(['A']);
    expect(codes(d15)).not.toContain('rotation-empty');
    expect(codes(d16)).not.toContain('rotation-empty');
  });

  it('flags an uncovered half', () => {
    const d = makeData({ monthly: { A: 'Body/IR' } }); // IR has F all month; Body is empty in the second half
    const e = new ScheduleEngine(d);
    expect(codes(e.day('2026-09-15'))).not.toContain('rotation-empty');
    expect(e.day('2026-09-16').issues.find((i) => i.code === 'rotation-empty')?.rotation).toBe('Body');
  });

  it('respects a custom split day', () => {
    const d = split();
    d.settings.splitDay = 10;
    expect(who(computeDay(d, '2026-09-11'), 'A').assignment).toBe('IR');
  });

  it('Vacation Cover takes over the half that applies that day', () => {
    const d = split();
    d.vacations.push({ residentId: 'A', start: '2026-09-14', end: '2026-09-18' });
    const e = new ScheduleEngine(d);
    expect(who(e.day('2026-09-15'), 'VC')).toMatchObject({ assignment: 'Body', coveringFor: 'A' });
    expect(who(e.day('2026-09-16'), 'VC')).toMatchObject({ assignment: 'IR', coveringFor: 'A' });
  });

  it('checks Vacation Cover / Post-Call per half and validates each part', () => {
    const d = makeData({ monthly: { VC: 'Vacation Cover/Body', PC: 'Chest/Post-Call', A: 'Body/Cardiac' } });
    const issues = new ScheduleEngine(d).monthIssues(MONTH);
    expect(issues.find((i) => i.code === 'no-vacation-cover')?.message).toMatch(/days 16–end/);
    expect(issues.find((i) => i.code === 'no-post-call')?.message).toMatch(/days 1–15/);
    expect(issues.some((i) => i.code === 'unknown-rotation' && i.rotation === 'Cardiac')).toBe(true);
  });
});

describe('call shift hours (onCallAt)', () => {
  // Mon 7 … Fri 11, Sat 12, Sun 13, Mon 14 (working days Mon–Fri)
  const calls = { '2026-09-07': 'A', '2026-09-08': 'B', '2026-09-11': 'F', '2026-09-12': 'S', '2026-09-13': 'U', '2026-09-14': 'M' };
  const cfg = (off: string[] = []) => ({
    weekdayStartMin: 16 * 60 + 30,
    offDayStartMin: 8 * 60,
    endMin: 8 * 60,
    isWorking: (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !off.includes(d),
  });
  const at = (date: string, h: number, m = 0, off: string[] = []) => onCallAt(calls, date, h * 60 + m, cfg(off));

  it('a working-day call runs from 16:30 until 08:00 the next morning', () => {
    expect(at('2026-09-08', 16, 29)).toMatchObject({ current: null, gap: true, next: 'B', nextFrom: '2026-09-08', nextFromMin: 990 });
    expect(at('2026-09-08', 16, 30)).toMatchObject({ current: 'B', currentSince: '2026-09-08', currentSinceMin: 990, gap: false });
    expect(at('2026-09-08', 23, 59).current).toBe('B');
    expect(at('2026-09-09', 7, 59)).toMatchObject({ current: 'B', currentSince: '2026-09-08', gap: false });
  });
  it('nobody is on call between the morning handover and the evening start of a working day', () => {
    expect(at('2026-09-08', 8, 0)).toMatchObject({ current: null, gap: true, next: 'B' });
    expect(at('2026-09-08', 12)).toMatchObject({ current: null, gap: true, next: 'B' });
  });
  it('a weekend call runs 08:00 to 08:00 with no gap', () => {
    expect(at('2026-09-12', 7, 59)).toMatchObject({ current: 'F', currentSince: '2026-09-11', next: 'S', nextFromMin: 480 });
    expect(at('2026-09-12', 8, 0)).toMatchObject({ current: 'S', currentSince: '2026-09-12', currentSinceMin: 480, gap: false, next: 'U' });
    expect(at('2026-09-13', 8, 0).current).toBe('U');
  });
  it('after a Sunday call, Monday has a daytime gap until 16:30', () => {
    expect(at('2026-09-14', 7, 59).current).toBe('U');
    expect(at('2026-09-14', 8, 0)).toMatchObject({ current: null, gap: true, next: 'M' });
    expect(at('2026-09-14', 16, 30).current).toBe('M');
  });
  it('a holiday uses the 08:00 start; the Friday before shows Saturday next', () => {
    expect(at('2026-09-08', 8, 0, ['2026-09-08'])).toMatchObject({ current: 'B', gap: false });
    expect(at('2026-09-11', 20, 0)).toMatchObject({ current: 'F', next: 'S', nextFromMin: 480 });
  });
  it('handles missing entries', () => {
    expect(at('2026-09-09', 17)).toMatchObject({ current: null, gap: false });
    expect(at('2026-09-10', 6)).toMatchObject({ current: null });
  });
});

describe('one resident covering several rotations ("Body+IR")', () => {
  it('places the resident on every rotation of the combination', () => {
    const d = makeData({ monthly: { A: 'Body+IR', F: 'Chest' } });
    const day = computeDay(d, TUE);
    expect(day.rotations['Body']).toEqual(['A']);
    expect(day.rotations['IR']).toEqual(['A']);
    expect(who(day, 'A')).toMatchObject({ status: 'working', assignment: 'Body+IR' });
    expect(codes(day)).not.toContain('rotation-empty');
  });

  it('counts towards each rotation’s capacity', () => {
    const d = makeData({ monthly: { B: 'Body', C: 'Body', D: 'Body+Neuro' } });
    expect(computeDay(d, TUE).issues.find((i) => i.code === 'rotation-over-capacity')?.rotation).toBe('Body');
  });

  it('combines with split months ("Body+IR/US")', () => {
    const e = new ScheduleEngine(makeData({ monthly: { A: 'Body+IR/US' } }));
    expect(e.day('2026-09-15').rotations['IR']).toContain('A');
    expect(e.day('2026-09-16').rotations['IR']).not.toContain('A');
    expect(e.day('2026-09-16').rotations['US']).toContain('A');
  });

  it('Vacation Cover takes over the whole combination', () => {
    const d = makeData({ monthly: { A: 'Body+IR', F: 'Chest' } });
    d.vacations.push({ residentId: 'A', start: TUE, end: TUE });
    const day = computeDay(d, TUE);
    expect(who(day, 'VC')).toMatchObject({ assignment: 'Body+IR', coveringFor: 'A' });
    expect(day.rotations['IR']).toEqual(['VC']);
  });

  it('Post-Call takes over the whole combination', () => {
    const d = makeData({ monthly: { A: 'Body+IR', F: 'Chest' } });
    d.calls[MON] = 'A';
    const day = computeDay(d, TUE);
    expect(day.rotations['Body']).toEqual(['PC']);
    expect(day.rotations['IR']).toEqual(['PC']);
  });

  it('a manual override can give one resident several rotations for a day', () => {
    const d = makeData({ monthly: { H: 'Body' } }); // Nuclear empty
    d.overrides[TUE] = { G: 'Body MRI+Nuclear' };
    const day = computeDay(d, TUE);
    expect(day.rotations['Nuclear']).toEqual(['G']);
    expect(codes(day)).not.toContain('rotation-empty');
  });

  it('validates each part and rejects combining special roles', () => {
    const d = makeData({ monthly: { A: 'Body+Cardiac', VC: 'Vacation Cover+Body' } });
    const issues = new ScheduleEngine(d).monthIssues(MONTH);
    expect(issues.some((i) => i.rotation === 'Cardiac')).toBe(true);
    expect(issues.some((i) => /cannot be combined/.test(i.message))).toBe(true);
  });
});
