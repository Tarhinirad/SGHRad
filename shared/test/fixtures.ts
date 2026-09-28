import { DEFAULT_ROTATIONS, DEFAULT_SETTINGS, type Resident, type ScheduleData, type Settings } from '../src/types';

// 2026-09 : Mon 2026-09-07 … Fri 2026-09-11; Sat 12, Sun 13, Mon 14.
export const MON = '2026-09-07';
export const TUE = '2026-09-08';
export const WED = '2026-09-09';
export const SAT = '2026-09-12';
export const SUN = '2026-09-13';
export const NEXT_MON = '2026-09-14';
export const MONTH = '2026-09';

export function res(id: string, extra: Partial<Resident> = {}): Resident {
  return { id, name: `Dr ${id}`, phone: '+961 1 000000', year: 'PGY-2', active: true, ...extra };
}

/**
 * A small department:
 *  A Body, B Chest, C MSK, D Neuro, E US, F IR, G Body MRI, H Nuclear,
 *  VC Vacation Cover, PC Post-Call, X Vascular (external)
 */
export function makeData(opts: { settings?: Partial<Settings>; monthly?: Record<string, string> } = {}): ScheduleData {
  const assignments: Record<string, string> = {
    A: 'Body',
    B: 'Chest',
    C: 'MSK',
    D: 'Neuro',
    E: 'US',
    F: 'IR',
    G: 'Body MRI',
    H: 'Nuclear',
    VC: 'Vacation Cover',
    PC: 'Post-Call',
    X: 'Vascular',
    ...opts.monthly,
  };
  const residents = Object.keys(assignments).map((id) => res(id));
  const monthly: ScheduleData['monthly'] = {};
  for (const [id, rot] of Object.entries(assignments)) if (rot) monthly[id] = { [MONTH]: rot };
  return {
    residents,
    rotations: DEFAULT_ROTATIONS.map((r) => ({ ...r })),
    monthly,
    vacations: [],
    calls: {},
    coverChoices: {},
    overrides: {},
    settings: { ...DEFAULT_SETTINGS, ...opts.settings },
  };
}
