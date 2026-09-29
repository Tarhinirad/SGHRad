import { describe, expect, it } from 'vitest';
import { DEFAULT_IR_CODES, irSummary, normalizeIrCodes } from '../src/irCodes';

describe('IR codes', () => {
  const by = (id: string) => DEFAULT_IR_CODES.procedures.find((x) => x.id === id)!;
  it('defaults follow the rule main code + guidance', () => {
    expect(irSummary(by('lung-bx'), DEFAULT_IR_CODES)).toBe('3960 + 4216');
    expect(irSummary(by('thyroid-bx'), DEFAULT_IR_CODES)).toBe('3875 + 5502');
    expect(irSummary(by('liver-bx'), DEFAULT_IR_CODES)).toBe('3929 + 4216 or 5502');
    expect(irSummary(by('nephrostomy'), DEFAULT_IR_CODES)).toBe('3971 or 3972 or 3974 + 4216 or 5502');
    expect(irSummary(by('arterio-stent'), DEFAULT_IR_CODES)).toBe('3918, 3922, 3923');
  });
  it('the defaults are valid and unchanged by normalizing', () => {
    expect(normalizeIrCodes(DEFAULT_IR_CODES)).toEqual(DEFAULT_IR_CODES);
  });
  it('rejects bad input', () => {
    const bad = (procs: unknown[]) => () => normalizeIrCodes({ ...DEFAULT_IR_CODES, procedures: procs });
    expect(bad([{ name: '', codes: ['1'], guidance: 'none' }])).toThrow(/name/);
    expect(bad([{ name: 'X', codes: [], guidance: 'none' }])).toThrow(/at least one code/);
    expect(bad([{ name: 'X', codes: ['a b'], guidance: 'none' }])).toThrow(/not a valid code/);
    expect(bad([{ name: 'X', codes: ['1'], guidance: 'mri' }])).toThrow(/guidance/);
    expect(() => normalizeIrCodes({ ...DEFAULT_IR_CODES, ct: { code: '', label: '' } })).toThrow(/CT/);
  });
  it('fills in ids, categories and de-duplicates ids', () => {
    const out = normalizeIrCodes({ ...DEFAULT_IR_CODES, procedures: [{ id: 'a', name: 'A', codes: ['1'], guidance: 'ct' }, { id: 'a', name: 'B', codes: ['2'], guidance: 'us' }] });
    expect(out.procedures[0]).toMatchObject({ id: 'a', category: 'Other', codesMode: 'all', notes: '' });
    expect(out.procedures[1].id).not.toBe('a');
  });
});
