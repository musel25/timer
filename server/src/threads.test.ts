import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-threads-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('threads table + CRUD', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let api: typeof import('./api').api;

  async function makeUser(id: string): Promise<string> {
    const { users, authSessions } = await import('./schema');
    const now = Date.now();
    db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', createdAt: now }).run();
    db.insert(authSessions).values({
      id: `sid_${id}`, userId: id, createdAt: now, expiresAt: now + 1e9, userAgent: null,
    }).run();
    return `sid=sid_${id}`;
  }
  const send = (method: string, cookie: string, body: unknown) =>
    ({ method, headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  const get = (cookie: string) => ({ method: 'GET', headers: { cookie } });

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ api } = await import('./api'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the threads table with every column', () => {
    const cols = sqlite.prepare('PRAGMA table_info(threads)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'title', 'lane', 'state', 'next_step',
        'wake_at', 'waiting_on', 'task_id', 'done_at', 'touched_at', 'created_at',
      ]),
    );
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await api.request('/threads', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('creates a thread parked by default, with the optional fields nulled', async () => {
    const cookie = await makeUser('ada');
    const res = await api.request('/threads', send('POST', cookie, { title: 'rewrite intro' }));
    expect(res.status).toBe(201);
    const t = await res.json();
    expect(t.title).toBe('rewrite intro');
    expect(t.state).toBe('parked');
    expect(t.lane).toBeNull();
    expect(t.nextStep).toBeNull();
    expect(t.wakeAt).toBeNull();
    expect(t.waitingOn).toBeNull();
    expect(t.doneAt).toBeNull();
  });

  it('setting a thread active demotes the previously active one to parked', async () => {
    const cookie = await makeUser('bob');
    const a = await (await api.request('/threads', send('POST', cookie, { title: 'A', state: 'active' }))).json();
    const b = await (await api.request('/threads', send('POST', cookie, { title: 'B' }))).json();

    await api.request(`/threads/${b.id}`, send('PATCH', cookie, { state: 'active' }));

    const list = await (await api.request('/threads', get(cookie))).json();
    const byId = Object.fromEntries(list.map((t: any) => [t.id, t]));
    expect(byId[b.id].state).toBe('active');
    expect(byId[a.id].state).toBe('parked');
  });

  it('scopes threads per user', async () => {
    const cookieC = await makeUser('cleo');
    await api.request('/threads', send('POST', cookieC, { title: 'cleo only' }));
    const mine = await (await api.request('/threads', get(cookieC))).json();
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('cleo only');
  });

  it('hides threads finished more than 24h ago, keeps recent ones', async () => {
    const cookie = await makeUser('dee');
    const old = await (await api.request('/threads', send('POST', cookie, { title: 'ancient' }))).json();
    const recent = await (await api.request('/threads', send('POST', cookie, { title: 'just done' }))).json();
    const day = 24 * 60 * 60 * 1000;
    await api.request(`/threads/${old.id}`, send('PATCH', cookie, { doneAt: Date.now() - day - 1000 }));
    await api.request(`/threads/${recent.id}`, send('PATCH', cookie, { doneAt: Date.now() }));

    const titles = (await (await api.request('/threads', get(cookie))).json()).map((t: any) => t.title);
    expect(titles).toContain('just done');
    expect(titles).not.toContain('ancient');
  });

  it('deletes a thread', async () => {
    const cookie = await makeUser('eve');
    const t = await (await api.request('/threads', send('POST', cookie, { title: 'gone soon' }))).json();
    expect((await api.request(`/threads/${t.id}`, { method: 'DELETE', headers: { cookie } })).status).toBe(200);
    expect(await (await api.request('/threads', get(cookie))).json()).toHaveLength(0);
  });

  it('round-trips threads through /export and /import', async () => {
    const cookie = await makeUser('fay');
    await api.request('/threads', send('POST', cookie, { title: 'exported', lane: 'thesis' }));
    const dump = await (await api.request('/export', get(cookie))).json();
    expect(dump.threads).toHaveLength(1);
    expect(dump.threads[0].lane).toBe('thesis');

    const cookieG = await makeUser('gil');
    await api.request('/import', send('POST', cookieG, { threads: dump.threads.map((t: any) => ({ ...t, id: `g_${t.id}` })) }));
    const gils = await (await api.request('/threads', get(cookieG))).json();
    expect(gils.map((t: any) => t.title)).toEqual(['exported']);
  });
});
