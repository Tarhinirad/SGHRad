/**
 * Sample data: 14 fictional residents across PGY-1..PGY-4 for the current academic year.
 * Run `npm run seed` to wipe the database and re-seed (the server also seeds an empty DB on first start).
 */
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ROTATIONS,
  DEFAULT_SETTINGS,
  POST_CALL,
  VACATION_COVER,
  academicYearMonths,
  academicYearStartFor,
  addDays,
  daysInRange,
  firstOfMonth,
  lastOfMonth,
  type Resident,
  type Vacation,
} from '../../shared/src/index';
import { type DB, audit, clearScheduleData, insertVacation, openDb, replaceRotations, saveSettings, setCall, setMonthly, upsertResident } from './db';

export const SAMPLE_RESIDENTS: Resident[] = [
  { id: 'R01', name: 'Karim Haddad', phone: '+961 70 100 201', year: 'PGY-4', active: true },
  { id: 'R02', name: 'Maya Khoury', phone: '+961 71 100 202', year: 'PGY-4', active: true },
  { id: 'R03', name: 'Elie Nassar', phone: '+961 76 100 203', year: 'PGY-4', active: true },
  { id: 'R04', name: 'Nour Saade', phone: '+961 70 100 204', year: 'PGY-3', active: true },
  { id: 'R05', name: 'Georges Aoun', phone: '+961 3 100 205', year: 'PGY-3', active: true },
  { id: 'R06', name: 'Rita Chamoun', phone: '+961 71 100 206', year: 'PGY-3', active: true },
  { id: 'R07', name: 'Joseph Fares', phone: '+961 70 100 207', year: 'PGY-3', active: true },
  { id: 'R08', name: 'Lara Gemayel', phone: '+961 76 100 208', year: 'PGY-2', active: true },
  { id: 'R09', name: 'Charbel Karam', phone: '+961 3 100 209', year: 'PGY-2', active: true },
  { id: 'R10', name: 'Yara Maalouf', phone: '+961 71 100 210', year: 'PGY-2', active: true },
  { id: 'R11', name: 'Tony Rizk', phone: '+961 70 100 211', year: 'PGY-2', active: true },
  { id: 'R12', name: 'Sara Abi Nader', phone: '+961 76 100 212', year: 'PGY-1', active: true },
  { id: 'R13', name: 'Marc Daher', phone: '+961 3 100 213', year: 'PGY-1', active: true },
  { id: 'R14', name: 'Christelle Hage', phone: '+961 71 100 214', year: 'PGY-1', active: true },
];

// 14 slots rotated across residents month by month: each month has exactly one
// Vacation Cover, one Post-Call and one external slot (Vascular/Elective for seniors).
const SLOTS = ['Body', 'Chest', 'MSK', 'Neuro', 'US', 'IR', 'Body MRI', 'Nuclear', 'Body', 'Chest', 'Neuro', VACATION_COVER, POST_CALL, 'EXT'];

export function sampleMonthly(yearStart: string) {
  const months = academicYearMonths(yearStart);
  const out: Record<string, Record<string, string>> = {};
  SAMPLE_RESIDENTS.forEach((r, i) => {
    out[r.id] = {};
    months.forEach((m, mi) => {
      let slot = SLOTS[(i + mi) % SLOTS.length];
      if (slot === 'EXT') slot = r.year === 'PGY-3' || r.year === 'PGY-4' ? (mi % 2 === 0 ? 'Vascular' : 'Elective') : 'US';
      out[r.id][m] = slot;
    });
  });
  return out;
}

export function sampleVacations(yearStart: string): Vacation[] {
  const months = academicYearMonths(yearStart);
  const out: Vacation[] = [];
  // Each resident: one ~2-week block, spread over the year (Mon–Fri x2, plus weekends).
  SAMPLE_RESIDENTS.forEach((r, i) => {
    const m = months[(i * 5) % 12];
    const startDay = 3 + ((i * 7) % 14);
    const start = `${m}-${String(startDay).padStart(2, '0')}`;
    out.push({ residentId: r.id, start, end: addDays(start, 11), notes: i % 3 === 0 ? 'Annual leave' : '' });
  });
  // A few short extra leaves, some overlapping to demonstrate cover conflicts.
  out.push({ residentId: 'R05', start: `${months[3]}-12`, end: `${months[3]}-14`, notes: 'Conference' });
  out.push({ residentId: 'R09', start: `${months[3]}-13`, end: `${months[3]}-15`, notes: 'Personal' });
  out.push({ residentId: 'R12', start: `${months[2]}-20`, end: `${months[2]}-21`, notes: 'Exam' });
  return out;
}

export function sampleCalls(yearStart: string, monthly: Record<string, Record<string, string>>, vacations: Vacation[]) {
  const months = academicYearMonths(yearStart);
  const calls: Record<string, string> = {};
  const onVacation = (id: string, d: string) => vacations.some((v) => v.residentId === id && v.start <= d && d <= v.end);
  const lastCall = new Map<string, string>();
  let prev = '';
  for (const d of daysInRange(firstOfMonth(months[0]), lastOfMonth(months[11]))) {
    const m = d.slice(0, 7);
    const tomorrow = addDays(d, 1);
    const eligible = SAMPLE_RESIDENTS.filter((r) => {
      const rot = monthly[r.id][m];
      return (
        r.id !== prev &&
        rot !== POST_CALL &&
        rot !== 'Vascular' &&
        rot !== 'Elective' &&
        !onVacation(r.id, d) &&
        !onVacation(r.id, tomorrow)
      );
    });
    // Least-recently-on-call first → fair rotation.
    eligible.sort((a, b) => (lastCall.get(a.id) ?? '').localeCompare(lastCall.get(b.id) ?? '') || a.id.localeCompare(b.id));
    const pick = eligible[0];
    if (!pick) continue;
    calls[d] = pick.id;
    lastCall.set(pick.id, d);
    prev = pick.id;
  }
  return calls;
}

export function sampleHolidays(yearStart: string): string[] {
  const y = Number(yearStart.slice(0, 4));
  // Common Lebanese public holidays falling in the academic year (editable in Settings).
  return [`${y}-08-15`, `${y}-11-22`, `${y}-12-25`, `${y + 1}-01-01`, `${y + 1}-01-06`, `${y + 1}-02-09`, `${y + 1}-05-01`];
}

export function seedDatabase(db: DB, today = new Date().toISOString().slice(0, 10)) {
  const yearStart = academicYearStartFor(today, DEFAULT_SETTINGS.academicYearStartMonth);
  const monthly = sampleMonthly(yearStart);
  const vacations = sampleVacations(yearStart);
  const calls = sampleCalls(yearStart, monthly, vacations);
  db.transaction(() => {
    clearScheduleData(db, true);
    replaceRotations(db, DEFAULT_ROTATIONS);
    saveSettings(db, { ...DEFAULT_SETTINGS, holidays: sampleHolidays(yearStart) });
    for (const r of SAMPLE_RESIDENTS) upsertResident(db, r);
    for (const [id, months] of Object.entries(monthly)) for (const [m, v] of Object.entries(months)) setMonthly(db, id, m, v);
    for (const v of vacations) insertVacation(db, v);
    for (const [d, id] of Object.entries(calls)) setCall(db, d, id);
    audit(db, 'system', 'seed', 'database', { yearStart, residents: SAMPLE_RESIDENTS.length });
  })();
  return { yearStart };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = openDb();
  const { yearStart } = seedDatabase(db);
  console.log(`Seeded ${SAMPLE_RESIDENTS.length} residents for the academic year starting ${yearStart}.`);
}
