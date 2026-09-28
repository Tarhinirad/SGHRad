import { describe, expect, it } from 'vitest';
import { academicYearMonths, academicYearStartFor, addDays, isValidISO, monthLabel, parseMonthLabel, startOfWeek, lastOfMonth } from '../src/dates';

describe('dates', () => {
  it('adds days across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('validates ISO dates', () => {
    expect(isValidISO('2026-02-30')).toBe(false);
    expect(isValidISO('2026-02-28')).toBe(true);
  });
  it('builds the academic year', () => {
    const m = academicYearMonths('2026-07');
    expect(m[0]).toBe('2026-07');
    expect(m[11]).toBe('2027-06');
    expect(academicYearStartFor('2027-03-01', 7)).toBe('2026-07');
    expect(academicYearStartFor('2026-07-01', 7)).toBe('2026-07');
  });
  it('formats and parses month labels', () => {
    expect(monthLabel('2026-07')).toBe('Jul 2026');
    expect(parseMonthLabel('Jul 2026')).toBe('2026-07');
    expect(parseMonthLabel('July-2026')).toBe('2026-07');
    expect(parseMonthLabel("Jul-26")).toBe('2026-07');
    expect(parseMonthLabel('2026-7')).toBe('2026-07');
    expect(parseMonthLabel('07/2026')).toBe('2026-07');
    expect(parseMonthLabel('Foo 2026')).toBeNull();
  });
  it('finds the Monday of the week and month end', () => {
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07');
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07');
    expect(lastOfMonth('2027-02')).toBe('2027-02-28');
  });
});

import { normalizeMonthly, rotationNames } from '../src/types';
describe('monthly value helpers', () => {
  it('normalises splits and combinations', () => {
    expect(normalizeMonthly(' Body + IR / US ')).toBe('Body+IR/US');
    expect(normalizeMonthly('Body+Body')).toBe('Body');
    expect(normalizeMonthly('IR/IR')).toBe('IR');
    expect(rotationNames('Body+IR/US')).toEqual(['Body', 'IR', 'US']);
  });
});
