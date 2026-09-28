/**
 * Free-hosting persistence: keep the working SQLite database in memory and store a snapshot of it
 * in Postgres (e.g. a free Neon database) via DATABASE_URL. The snapshot is loaded at startup and
 * saved shortly after every change, and again on shutdown. The data set is small (well under 1 MB).
 */
import pg from 'pg';
import type { DB } from './db';

export interface SnapshotStore {
  load(): Promise<Buffer | null>;
  save(data: Buffer): Promise<void>;
  close(): Promise<void>;
}

export async function postgresStore(url: string): Promise<SnapshotStore> {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /sslmode=disable/.test(url) || /@(localhost|127\.0\.0\.1)/.test(url) ? undefined : { rejectUnauthorized: false },
    max: 2,
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS sgumc_snapshot (
    id INTEGER PRIMARY KEY,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  return {
    async load() {
      const r = await pool.query('SELECT data FROM sgumc_snapshot WHERE id = 1');
      return r.rows[0]?.data ?? null;
    },
    async save(data) {
      await pool.query(
        `INSERT INTO sgumc_snapshot (id, data, updated_at) VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [data],
      );
    },
    close: () => pool.end(),
  };
}

/** Debounced saver: call `changed()` after writes; `flush()` saves immediately if anything is pending. */
export function snapshotSaver(db: DB, store: SnapshotStore, delayMs = 1500) {
  let timer: NodeJS.Timeout | null = null;
  let pending = false;
  let chain: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return chain;
    pending = false;
    const data = db.serialize();
    chain = chain
      .then(() => store.save(data))
      .catch((e) => {
        pending = true; // retry on the next change / flush
        console.error('Saving database snapshot failed:', (e as Error).message);
      });
    return chain;
  };

  return {
    changed() {
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
  };
}
