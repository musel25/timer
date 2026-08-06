import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-task-archive-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('archiving a task', () => {
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

  beforeAll(async () => {
    ({ sqlite, db } = await import('./db'));
    ({ api } = await import('./api'));
    (await import('./db')).migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds archived_at to the tasks table', () => {
    const cols = sqlite.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('archived_at');
  });

  it('archives an undated task and still returns it from GET /tasks', async () => {
    const cookie = await makeUser('dana');
    const created = await (await api.request('/tasks', send('POST', cookie, {
      title: 'maybe learn rust', date: null,
    }))).json();
    expect(created.archivedAt).toBeNull();

    const at = Date.now();
    const archived = await (await api.request(
      `/tasks/${created.id}`, send('PATCH', cookie, { archivedAt: at }),
    )).json();
    expect(archived.archivedAt).toBe(at);

    // The board decides what to show; the API keeps returning everything.
    const all = await (await api.request('/tasks', { headers: { cookie } })).json();
    expect(all.map((t: { id: string }) => t.id)).toContain(created.id);
  });

  it('restores a task by nulling archivedAt', async () => {
    const cookie = await makeUser('erin');
    const created = await (await api.request('/tasks', send('POST', cookie, { title: 'back' }))).json();
    await api.request(`/tasks/${created.id}`, send('PATCH', cookie, { archivedAt: Date.now() }));

    const restored = await (await api.request(
      `/tasks/${created.id}`, send('PATCH', cookie, { archivedAt: null }),
    )).json();
    expect(restored.archivedAt).toBeNull();
  });
});
