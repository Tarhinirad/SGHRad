/**
 * Generates the sample Excel files in templates/:
 *   SGUMC_Radiology_Schedule_Sample.xlsx   – the seed data (14 residents, full academic year)
 *   SGUMC_Radiology_Schedule_Template.xlsx – the same structure, empty
 * Usage: npm run template [-- 2026]   (academic year start, default: current)
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROTATIONS, DEFAULT_SETTINGS, academicYearStartFor, type ScheduleData } from '../../../shared/src/index';
import { buildWorkbook } from '../excel';
import { SAMPLE_RESIDENTS, sampleCalls, sampleMonthly, sampleVacations } from '../seed';

const arg = process.argv[2];
const yearStart = arg && /^\d{4}$/.test(arg) ? `${arg}-07` : academicYearStartFor(new Date().toISOString().slice(0, 10), DEFAULT_SETTINGS.academicYearStartMonth);

const monthly = sampleMonthly(yearStart);
const vacations = sampleVacations(yearStart, monthly);
const sample: ScheduleData = {
  residents: SAMPLE_RESIDENTS,
  rotations: DEFAULT_ROTATIONS,
  monthly,
  vacations,
  calls: sampleCalls(yearStart, monthly, vacations),
  coverChoices: {},
  overrides: {},
  settings: DEFAULT_SETTINGS,
};
const empty: ScheduleData = { ...sample, residents: [], monthly: {}, vacations: [], calls: {} };

const outDir = path.resolve('templates');
fs.mkdirSync(outDir, { recursive: true });
for (const [file, data] of [
  ['SGUMC_Radiology_Schedule_Sample.xlsx', sample],
  ['SGUMC_Radiology_Schedule_Template.xlsx', empty],
] as const) {
  const wb = await buildWorkbook(data, yearStart);
  await wb.xlsx.writeFile(path.join(outDir, file));
  console.log(`Wrote templates/${file}`);
}
