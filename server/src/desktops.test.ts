import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-desktops-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('desktops table + CRUD', () => {
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

  it('creates the desktops table with every column', () => {
    const cols = sqlite.prepare('PRAGMA table_info(desktops)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'title', 'lane', 'description', 'tasks', 'comments',
        'focused', 'sort_order', 'archived_at', 'created_at', 'updated_at',
      ]),
    );
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await api.request('/desktops', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('creates a desktop with empty tasks/comments and sane defaults', async () => {
    const cookie = await makeUser('ada');
    const res = await api.request('/desktops', send('POST', cookie, { title: 'Thesis' }));
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d.title).toBe('Thesis');
    expect(d.tasks).toEqual([]);
    expect(d.comments).toEqual([]);
    expect(d.focused).toBe(false);
    expect(d.lane).toBeNull();
    expect(d.description).toBeNull();
    expect(d.archivedAt).toBeNull();
  });

  it('round-trips tasks and comments as JSON', async () => {
    const cookie = await makeUser('bea');
    const created = await (await api.request('/desktops', send('POST', cookie, {
      title: 'Timer', lane: 'timer',
      tasks: [{ id: 't1', text: 'build grid', done: false }],
      comments: [{ id: 'c1', text: 'collapse like GNOME', at: 1000 }],
    }))).json();
    const list = await (await api.request('/desktops', get(cookie))).json();
    expect(list[0].tasks).toEqual([{ id: 't1', text: 'build grid', done: false }]);
    expect(list[0].comments).toEqual([{ id: 'c1', text: 'collapse like GNOME', at: 1000 }]);
    expect(created.id).toBe(list[0].id);
  });

  it('focusing a desktop demotes the previously focused one', async () => {
    const cookie = await makeUser('bob');
    const a = await (await api.request('/desktops', send('POST', cookie, { title: 'A', focused: true }))).json();
    const b = await (await api.request('/desktops', send('POST', cookie, { title: 'B' }))).json();

    await api.request(`/desktops/${b.id}`, send('PATCH', cookie, { focused: true }));

    const list = await (await api.request('/desktops', get(cookie))).json();
    const byId = Object.fromEntries(list.map((d: any) => [d.id, d]));
    expect(byId[b.id].focused).toBe(true);
    expect(byId[a.id].focused).toBe(false);
  });

  it('scopes desktops per user', async () => {
    const cookieC = await makeUser('cleo');
    await api.request('/desktops', send('POST', cookieC, { title: 'cleo only' }));
    const mine = await (await api.request('/desktops', get(cookieC))).json();
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('cleo only');
  });

  it('archiving hides a desktop from GET (the journal survives in the row)', async () => {
    const cookie = await makeUser('dee');
    const d = await (await api.request('/desktops', send('POST', cookie, { title: 'done soon' }))).json();
    await api.request(`/desktops/${d.id}`, send('PATCH', cookie, { archivedAt: Date.now() }));
    expect(await (await api.request('/desktops', get(cookie))).json()).toHaveLength(0);
  });

  it('lists in sortOrder order (the displayed number is index+1)', async () => {
    const cookie = await makeUser('eve');
    await api.request('/desktops', send('POST', cookie, { title: 'second', sortOrder: 20 }));
    await api.request('/desktops', send('POST', cookie, { title: 'first', sortOrder: 10 }));
    const titles = (await (await api.request('/desktops', get(cookie))).json()).map((d: any) => d.title);
    expect(titles).toEqual(['first', 'second']);
  });

  it('deletes a desktop', async () => {
    const cookie = await makeUser('fay');
    const d = await (await api.request('/desktops', send('POST', cookie, { title: 'gone' }))).json();
    expect((await api.request(`/desktops/${d.id}`, { method: 'DELETE', headers: { cookie } })).status).toBe(200);
    expect(await (await api.request('/desktops', get(cookie))).json()).toHaveLength(0);
  });

  it('round-trips desktops through /export and /import', async () => {
    const cookie = await makeUser('gil');
    await api.request('/desktops', send('POST', cookie, {
      title: 'exported', lane: 'thesis', tasks: [{ id: 't1', text: 'x', done: true }],
    }));
    const dump = await (await api.request('/export', get(cookie))).json();
    expect(dump.desktops).toHaveLength(1);
    expect(dump.desktops[0].tasks[0].done).toBe(true);

    const cookieH = await makeUser('han');
    await api.request('/import', send('POST', cookieH, { desktops: dump.desktops.map((d: any) => ({ ...d, id: `h_${d.id}` })) }));
    const hans = await (await api.request('/desktops', get(cookieH))).json();
    expect(hans.map((d: any) => d.title)).toEqual(['exported']);
  });
});
