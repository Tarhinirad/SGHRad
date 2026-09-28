import 'dotenv/config';
import { createApp, today } from './app';
import { isEmpty, openDb } from './db';
import { seedDatabase } from './seed';

const db = openDb();
if (isEmpty(db) && process.env.SEED_ON_EMPTY !== 'false') {
  const { yearStart } = seedDatabase(db, today());
  console.log(`Empty database – seeded sample data for the academic year starting ${yearStart}.`);
}

const port = Number(process.env.PORT ?? 3001);
createApp(db).listen(port, () => {
  console.log(`SGUMC Radiology Schedule API listening on http://localhost:${port}`);
  if (!process.env.ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD not set – using the default "admin". Set it in .env before deploying.');
  if (!process.env.VIEWER_PASSWORD) console.warn('WARNING: VIEWER_PASSWORD not set – using the default "resident".');
});
