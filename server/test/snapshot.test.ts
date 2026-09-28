import { describe, expect, it } from 'vitest';
import { getCalls, openDb, setCall } from '../src/db';
import { seedDatabase } from '../src/seed';
import { postgresStore, snapshotSaver, type SnapshotStore } from '../src/snapshot';

function memoryStore(): SnapshotStore & { saves: number; data: Buffer | null } {
  const s = {
    saves: 0,
    data: null as Buffer | null,
    async load() {
      return s.data;
    },
    async save(d: Buffer) {
      s.saves++;
      s.data = d;
    },
    async close() {},
  };
  return s;
}

describe('snapshot persistence', () => {
  it('round-trips the whole database through a snapshot', () => {
    const db = openDb(':memory:');
    seedDatabase(db, '2026-09-28');
    setCall(db, '2026-10-01', 'R07');
    const copy = openDb(db.serialize());
    expect(getCalls(copy)).toEqual(getCalls(db));
  });

  it('debounces saves and flushes pending changes', async () => {
    const db = openDb(':memory:');
    const store = memoryStore();
    const saver = snapshotSaver(db, store, 10_000);
    saver.changed();
    saver.changed();
    expect(store.saves).toBe(0);
    await saver.flush();
    expect(store.saves).toBe(1);
    await saver.flush(); // nothing pending
    expect(store.saves).toBe(1);
    setCall(db, '2026-10-02', 'R01');
    saver.changed();
    await saver.flush();
    expect(getCalls(openDb(store.data!))['2026-10-02']).toBe('R01');
  });

  it('retries after a failed save', async () => {
    const db = openDb(':memory:');
    const store = memoryStore();
    let fail = true;
    const flaky: SnapshotStore = { ...store, save: async (d) => (fail ? Promise.reject(new Error('down')) : store.save(d)) };
    const saver = snapshotSaver(db, flaky, 10_000);
    saver.changed();
    await saver.flush();
    expect(store.saves).toBe(0);
    fail = false;
    await saver.flush();
    expect(store.saves).toBe(1);
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)('stores snapshots in Postgres', async () => {
    const store = await postgresStore(process.env.TEST_DATABASE_URL!);
    const db = openDb(':memory:');
    seedDatabase(db, '2026-09-28');
    await store.save(db.serialize());
    const loaded = await store.load();
    expect(getCalls(openDb(loaded!))).toEqual(getCalls(db));
    await store.close();
  });
});
