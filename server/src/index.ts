import 'dotenv/config';
import { createApp, today } from './app';
import { type DB, isEmpty, openDb } from './db';
import { seedDatabase } from './seed';
import { postgresStore, snapshotSaver } from './snapshot';

async function main() {
  let db: DB;
  let saver: ReturnType<typeof snapshotSaver> | null = null;

  if (process.env.DATABASE_URL) {
    // Free hosting mode: in-memory SQLite, persisted as a snapshot in Postgres.
    const store = await postgresStore(process.env.DATABASE_URL);
    const snap = await store.load();
    db = openDb(snap ?? ':memory:');
    saver = snapshotSaver(db, store);
    console.log(snap ? `Loaded database snapshot from Postgres (${snap.length} bytes).` : 'No snapshot in Postgres yet – starting fresh.');
    const shutdown = async () => {
      await saver!.flush();
      await store.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());
  } else {
    db = openDb();
  }

  if (isEmpty(db) && process.env.SEED_ON_EMPTY !== 'false') {
    const { yearStart } = seedDatabase(db, today());
    console.log(`Empty database – seeded sample data for the academic year starting ${yearStart}.`);
    saver?.changed();
  }

  const port = Number(process.env.PORT ?? 3001);
  const app = createApp(db, { onChange: () => saver?.changed() });
  saver?.changed(); // persist anything createApp initialised (e.g. the generated session secret)
  app.listen(port, () => {
    console.log(`SGUMC Radiology Schedule API listening on http://localhost:${port}`);
    if (!process.env.ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD not set – using the default "admin". Set it before deploying.');
    if (!process.env.VIEWER_PASSWORD) console.warn('WARNING: VIEWER_PASSWORD not set – using the default "resident".');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
