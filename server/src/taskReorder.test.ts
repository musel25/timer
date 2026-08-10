import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-task-reorder-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('POST /tasks/reorder', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
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

  const add = async (cookie: string, title: string, date: string | null) =>
    (await (await api.request('/tasks', send('POST', cookie, { title, date }))).json()) as
      { id: string; title: string; date: string | null; sortOrder: number };

  const list = async (cookie: string) =>
    (await (await api.request('/tasks', { headers: { cookie } })).json()) as
      { id: string; title: string; date: string | null; sortOrder: number }[];

  beforeAll(async () => {
    ({ sqlite, db } = await import('./db'));
    ({ api } = await import('./api'));
    (await import('./db')).migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('renumbers a column into the given order', async () => {
    const cookie = await makeUser('nora');
    const a = await add(cookie, 'a', '2026-08-10');
    const b = await add(cookie, 'b', '2026-08-10');
    const c = await add(cookie, 'c', '2026-08-10');

    const res = await api.request('/tasks/reorder', send('POST', cookie, {
      date: '2026-08-10', ids: [c.id, a.id, b.id],
    }));
    expect(res.status).toBe(200);

    const byId = new Map((await list(cookie)).map((t) => [t.id, t]));
    expect(byId.get(c.id)!.sortOrder).toBe(0);
    expect(byId.get(a.id)!.sortOrder).toBe(1);
    expect(byId.get(b.id)!.sortOrder).toBe(2);
  });

  it('sets the date too, so a cross-column drag is one call', async () => {
    const cookie = await makeUser('omar');
    const stay = await add(cookie, 'stay', '2026-08-10');
    const moved = await add(cookie, 'moved', null);

    await api.request('/tasks/reorder', send('POST', cookie, {
      date: '2026-08-10', ids: [moved.id, stay.id],
    }));

    const byId = new Map((await list(cookie)).map((t) => [t.id, t]));
    expect(byId.get(moved.id)!.date).toBe('2026-08-10');
    expect(byId.get(moved.id)!.sortOrder).toBe(0);
    expect(byId.get(stay.id)!.sortOrder).toBe(1);
  });

  it('moves a task back to the Inbox when date is null', async () => {
    const cookie = await makeUser('pia');
    const t = await add(cookie, 'inboxed', '2026-08-10');

    await api.request('/tasks/reorder', send('POST', cookie, { date: null, ids: [t.id] }));

    expect((await list(cookie)).find((r) => r.id === t.id)!.date).toBeNull();
  });

  it('ignores ids owned by another user', async () => {
    const victimCookie = await makeUser('quinn');
    const attackerCookie = await makeUser('rex');
    const victim = await add(victimCookie, 'not yours', '2026-08-10');
    const mine = await add(attackerCookie, 'mine', '2026-08-10');

    const res = await api.request('/tasks/reorder', send('POST', attackerCookie, {
      date: '2026-08-11', ids: [victim.id, mine.id],
    }));
    expect(res.status).toBe(200);

    const untouched = (await list(victimCookie)).find((t) => t.id === victim.id)!;
    expect(untouched.date).toBe('2026-08-10');
    expect(untouched.sortOrder).toBe(victim.sortOrder);
  });

  it('ignores unknown ids instead of erroring', async () => {
    const cookie = await makeUser('sara');
    const t = await add(cookie, 'real', '2026-08-10');

    const res = await api.request('/tasks/reorder', send('POST', cookie, {
      date: '2026-08-10', ids: ['ghost', t.id],
    }));
    expect(res.status).toBe(200);
    // The ghost still consumed index 0 — positions stay stable relative to each other.
    expect((await list(cookie)).find((r) => r.id === t.id)!.sortOrder).toBe(1);
  });

  it('rejects a malformed body', async () => {
    const cookie = await makeUser('tom');
    const res = await api.request('/tasks/reorder', send('POST', cookie, { ids: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await api.request('/tasks/reorder', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: null, ids: [] }),
    });
    expect(res.status).toBe(401);
  });
});
