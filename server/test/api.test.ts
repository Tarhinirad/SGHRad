import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { seedDatabase } from '../src/seed';

let server: Server;
let base = '';
let admin = '';
let viewer = '';

async function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, body: (ct.includes('json') ? await res.json() : await res.arrayBuffer()) as any };
}

beforeAll(async () => {
  process.env.ADMIN_PASSWORD = 'adm-pw';
  process.env.VIEWER_PASSWORD = 'view-pw';
  const db = openDb(':memory:');
  seedDatabase(db, '2026-09-28');
  server = createApp(db).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = (await call('/api/login', { method: 'POST', json: { password: 'adm-pw', name: 'Dr Chief' } })).body.token;
  viewer = (await call('/api/login', { method: 'POST', json: { password: 'view-pw' } })).body.token;
});

afterAll(() => server?.close());

describe('API', () => {
  it('rejects wrong passwords', async () => {
    expect((await call('/api/login', { method: 'POST', json: { password: 'nope' } })).status).toBe(401);
  });

  it('lets anyone view without a password, but not edit or read the audit log', async () => {
    const me = await call('/api/me');
    expect(me.body).toMatchObject({ role: 'viewer', guest: true, publicView: true });
    expect((await call('/api/data')).status).toBe(200);
    expect((await call('/api/data', { token: 'forged.token' })).status).toBe(200);
    expect((await call('/api/calls/2026-10-01', { method: 'PUT', json: { residentId: 'R01' } })).status).toBe(403);
    expect((await call('/api/calls/2026-10-01', { method: 'PUT', token: 'forged.token', json: { residentId: 'R01' } })).status).toBe(403);
    expect((await call('/api/audit')).status).toBe(403);
    expect((await call('/api/audit', { token: viewer })).status).toBe(403);
  });

  it('can require a login to view (REQUIRE_LOGIN_TO_VIEW=true)', async () => {
    process.env.REQUIRE_LOGIN_TO_VIEW = 'true';
    try {
      expect((await call('/api/data')).status).toBe(401);
      expect((await call('/api/data', { token: viewer })).status).toBe(200);
    } finally {
      delete process.env.REQUIRE_LOGIN_TO_VIEW;
    }
  });

  it('lets viewers read but not edit', async () => {
    const data = await call('/api/data', { token: viewer });
    expect(data.status).toBe(200);
    expect(data.body.residents).toHaveLength(14);
    const put = await call('/api/calls/2026-10-01', { method: 'PUT', token: viewer, json: { residentId: 'R01' } });
    expect(put.status).toBe(403);
  });

  it('computes the schedule for a range', async () => {
    const r = await call('/api/schedule?from=2026-09-28&to=2026-10-04', { token: viewer });
    expect(r.body).toHaveLength(7);
    expect(r.body[0].date).toBe('2026-09-28');
  });

  it('edits data and records the audit log', async () => {
    expect((await call('/api/calls/2026-10-01', { method: 'PUT', token: admin, json: { residentId: 'R04' } })).status).toBe(200);
    expect((await call('/api/monthly', { method: 'PUT', token: admin, json: { residentId: 'R01', month: '2026-10', value: 'IR' } })).status).toBe(200);
    expect((await call('/api/monthly', { method: 'PUT', token: admin, json: { residentId: 'R01', month: '2026-10', value: 'Bogus' } })).status).toBe(400);
    const v = await call('/api/vacations', { method: 'POST', token: admin, json: { residentId: 'R02', start: '2026-12-01', end: '2026-12-03' } });
    expect(v.status).toBe(200);
    expect((await call(`/api/vacations/${v.body.id}`, { method: 'DELETE', token: admin })).status).toBe(200);
    const bad = await call('/api/vacations', { method: 'POST', token: admin, json: { residentId: 'R02', start: '2026-12-05', end: '2026-12-01' } });
    expect(bad.status).toBe(400);

    const data = (await call('/api/data', { token: admin })).body;
    expect(data.calls['2026-10-01']).toBe('R04');
    expect(data.monthly['R01']['2026-10']).toBe('IR');

    const log = (await call('/api/audit', { token: admin })).body;
    expect(log.entries[0]).toMatchObject({ user: 'Dr Chief', action: 'delete', entity: 'vacation' });
    expect(log.entries.some((e: any) => e.entity === 'monthly' && e.details.after === 'IR')).toBe(true);
  });

  it('accepts split months and renames inside them', async () => {
    const put = (value: string) => call('/api/monthly', { method: 'PUT', token: admin, json: { residentId: 'R02', month: '2026-11', value } });
    expect((await put('Chest / MSK')).status).toBe(200);
    expect((await put('Chest/Nope')).status).toBe(400);
    expect((await put('Chest/MSK/US')).status).toBe(400);
    let data = (await call('/api/data', { token: admin })).body;
    expect(data.monthly['R02']['2026-11']).toBe('Chest/MSK');
    await call('/api/rotations/MSK', { method: 'PUT', token: admin, json: { name: 'Musculoskeletal' } });
    data = (await call('/api/data', { token: admin })).body;
    expect(data.monthly['R02']['2026-11']).toBe('Chest/Musculoskeletal');
    await call('/api/rotations/Musculoskeletal', { method: 'PUT', token: admin, json: { name: 'MSK' } });
  });

  it('renames a rotation everywhere and protects special roles', async () => {
    const r = await call('/api/rotations/Nuclear', { method: 'PUT', token: admin, json: { name: 'Nuclear Medicine' } });
    expect(r.status).toBe(200);
    const data = (await call('/api/data', { token: admin })).body;
    expect(Object.values(data.monthly).some((m: any) => Object.values(m).includes('Nuclear'))).toBe(false);
    expect(Object.values(data.monthly).some((m: any) => Object.values(m).includes('Nuclear Medicine'))).toBe(true);
    expect((await call('/api/rotations/Post-Call', { method: 'PUT', token: admin, json: { name: 'PC' } })).status).toBe(400);
    expect((await call('/api/rotations/Body', { method: 'DELETE', token: admin })).status).toBe(400);
  });

  it('exports and re-imports the workbook', async () => {
    const x = await call('/api/export?year=2026', { token: viewer });
    expect(x.status).toBe(200);
    const buf = x.body as ArrayBuffer;
    const preview = await call('/api/import/preview?mode=merge', { method: 'POST', token: admin, body: Buffer.from(buf) });
    expect(preview.status).toBe(200);
    expect(preview.body.ok).toBe(true);
    expect(preview.body.summary.residents.unchanged).toBe(14);
    const commit = await call('/api/import/commit?mode=replace', { method: 'POST', token: admin, body: Buffer.from(buf) });
    expect(commit.body.ok).toBe(true);
  });

  it('updates settings with validation', async () => {
    expect((await call('/api/settings', { method: 'PUT', token: admin, json: { maxPerRotation: 0 } })).status).toBe(400);
    const ok = await call('/api/settings', { method: 'PUT', token: admin, json: { allowConsecutiveCalls: true, workingDays: [1, 2, 3, 4, 5, 6] } });
    expect(ok.body.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
