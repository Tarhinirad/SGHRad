import { describe, expect, it } from 'vitest';
import { callStats, callType, weekendMedal, type WeekendContext } from '../src/callStats';
import { weekday } from '../src/dates';

// Week of Mon 2026-09-07: Wed 9, Thu 10, Fri 11, Sat 12, Sun 13, Mon 14
const working = (off: string[] = []) => (d: string) => ![0, 6].includes(weekday(d)) && !off.includes(d);
const ctx = (calls: Record<string, string>, off: string[] = [], vac: Record<string, string[]> = {}): WeekendContext => ({
  calls,
  isWorking: working(off),
  onVacation: (id, d) => !!vac[id]?.includes(d),
});

describe('callType', () => {
  it('classifies a normal week', () => {
    const w = working();
    expect(['2026-09-07', '2026-09-08', '2026-09-09'].map((d) => callType(d, w))).toEqual(['weekday', 'weekday', 'weekday']);
    expect(callType('2026-09-10', w)).toBe('thursday');
    expect(callType('2026-09-11', w)).toBe('friday');
    expect(callType('2026-09-12', w)).toBe('saturday');
    expect(callType('2026-09-13', w)).toBe('sunday');
  });

  it('shifts the equivalents when Friday is off', () => {
    const w = working(['2026-09-11']);
    expect(callType('2026-09-09', w)).toBe('thursday'); // Wed → like Thursday
    expect(callType('2026-09-10', w)).toBe('friday'); // Thu → like Friday
    expect(callType('2026-09-11', w)).toBe('saturday'); // Fri (off) → like Saturday
    expect(callType('2026-09-12', w)).toBe('saturday');
    expect(callType('2026-09-13', w)).toBe('sunday');
  });

  it('treats a Sunday before a Monday holiday as a Saturday', () => {
    expect(callType('2026-09-13', working(['2026-09-14']))).toBe('saturday');
  });
});

describe('weekendMedal', () => {
  const sat = '2026-09-12';
  it('bronze: Friday call, Saturday and Sunday off', () => {
    expect(weekendMedal('A', sat, ctx({ '2026-09-11': 'A' }))).toBe('bronze');
  });
  it('silver: no call Friday, Saturday or Sunday', () => {
    expect(weekendMedal('A', sat, ctx({ '2026-09-11': 'B' }))).toBe('silver');
  });
  it('none when on call Saturday or Sunday, or on vacation', () => {
    expect(weekendMedal('A', sat, ctx({ '2026-09-12': 'A' }))).toBeNull();
    expect(weekendMedal('A', sat, ctx({ '2026-09-13': 'A' }))).toBeNull();
    expect(weekendMedal('A', sat, ctx({}, [], { A: ['2026-09-12'] }))).toBeNull();
  });
  it('golden: post-call on Friday (Thursday call), no weekend call', () => {
    expect(weekendMedal('A', sat, ctx({ '2026-09-10': 'A', '2026-09-11': 'B' }))).toBe('golden');
  });
  it('diamond: golden plus Monday off', () => {
    expect(weekendMedal('A', sat, ctx({ '2026-09-10': 'A' }, ['2026-09-14']))).toBe('diamond');
  });
  it('diamond: Friday off and Thursday post-call (Wednesday call)', () => {
    expect(weekendMedal('A', sat, ctx({ '2026-09-09': 'A' }, ['2026-09-11']))).toBe('diamond');
  });
  it('a Thursday call with Friday off is not golden', () => {
    expect(weekendMedal('A', sat, ctx({ '2026-09-10': 'A' }, ['2026-09-11']))).toBe('silver');
  });
});

describe('callStats', () => {
  it('counts by type and medals, skipping unscheduled weekends', () => {
    const calls = {
      '2026-09-07': 'A', // weekday
      '2026-09-10': 'A', // thursday
      '2026-09-11': 'B', // friday
      '2026-09-12': 'C', // saturday
      '2026-09-13': 'C', // sunday
      '2026-09-19': 'A', // Saturday of a weekend with no Friday/Sunday calls
    };
    const s = callStats(['A', 'B', 'C'], '2026-09-01', '2026-09-30', ctx(calls));
    expect(s.get('A')!.byType).toEqual({ weekday: 1, thursday: 1, friday: 0, saturday: 1, sunday: 0 });
    expect(s.get('A')!.total).toBe(3);
    expect(s.get('A')!.offDays).toBe(1);
    expect(s.get('A')!.medals).toEqual({ bronze: 0, silver: 0, golden: 1, diamond: 0 });
    expect(s.get('B')!.medals.bronze).toBe(1);
    expect(s.get('C')!.medals).toEqual({ bronze: 0, silver: 0, golden: 0, diamond: 0 });
  });
});
