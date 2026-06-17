import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

// Point the DB at a throwaway file BEFORE importing db.ts (reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-attach-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('task_attachments migration + blob round-trip', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let taskAttachments: typeof import('./schema').taskAttachments;

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ taskAttachments } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    // sqlite stays open; the HTTP-routes describe below also uses this DB.
    // Final cleanup (close + rmSync) is done in that describe's afterAll.
  });

  it('creates task_attachments with the expected columns', () => {
    const cols = (sqlite.prepare('PRAGMA table_info(task_attachments)').all() as { name: string }[]).map((c) => c.name);
    for (const col of ['id', 'user_id', 'task_id', 'mime', 'data', 'width', 'height', 'created_at']) {
      expect(cols).toContain(col);
    }
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('round-trips a binary blob', () => {
    const now = Date.now();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff]);
    db.insert(taskAttachments).values({
      id: 'a1', userId: 'u1', taskId: 't1', mime: 'image/png', data: bytes, width: 1, height: 1, createdAt: now,
    }).run();
    const got = db.select().from(taskAttachments).where(eq(taskAttachments.id, 'a1')).get();
    expect(got?.mime).toBe('image/png');
    expect(Buffer.from(got!.data as Buffer).equals(bytes)).toBe(true);
    expect(got?.width).toBe(1);
  });
});

// 1x1 transparent PNG.
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('attachment HTTP routes', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let api: typeof import('./api').api;
  let users: typeof import('./schema').users;
  let authSessions: typeof import('./schema').authSessions;
  let tasks: typeof import('./schema').tasks;

  // Insert a user + a future-dated session; return a Cookie header for it.
  function makeUser(id: string): string {
    const now = Date.now();
    db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', createdAt: now }).run();
    const sid = `sid_${id}`;
    db.insert(authSessions).values({ id: sid, userId: id, createdAt: now, expiresAt: now + 1e9, userAgent: null }).run();
    return `sid=${sid}`;
  }
  const json = (cookie: string, body: unknown) =>
    ({ headers: { 'content-type': 'application/json', cookie }, method: 'POST', body: JSON.stringify(body) });

  beforeAll(async () => {
    ({ sqlite, db } = await import('./db'));
    ({ api } = await import('./api'));
    ({ users, authSessions, tasks } = await import('./schema'));
    (await import('./db')).migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('uploads an image and returns metadata without bytes', async () => {
    const cookie = makeUser('alice');
    db.insert(tasks).values({ id: 'task-a', userId: 'alice', title: 'A', sortOrder: 1, createdAt: Date.now() }).run();
    const res = await api.request('/tasks/task-a/attachments', json(cookie, { dataUrl: PNG_1x1, width: 1, height: 1 }));
    expect(res.status).toBe(201);
    const meta = await res.json();
    expect(meta.taskId).toBe('task-a');
    expect(meta.mime).toBe('image/png');
    expect(meta.id).toBeTruthy();
    expect(meta.data).toBeUndefined();
  });

  it('rejects a disallowed mime', async () => {
    const cookie = makeUser('bob');
    db.insert(tasks).values({ id: 'task-b', userId: 'bob', title: 'B', sortOrder: 1, createdAt: Date.now() }).run();
    const bad = 'data:application/pdf;base64,JVBERi0=';
    const res = await api.request('/tasks/task-b/attachments', json(cookie, { dataUrl: bad }));
    expect(res.status).toBe(400);
  });

  it('rejects an oversize image', async () => {
    const cookie = makeUser('carol');
    db.insert(tasks).values({ id: 'task-c', userId: 'carol', title: 'C', sortOrder: 1, createdAt: Date.now() }).run();
    const bigB64 = Buffer.alloc(3 * 1024 * 1024 + 10, 0).toString('base64');
    const res = await api.request('/tasks/task-c/attachments', json(cookie, { dataUrl: `data:image/png;base64,${bigB64}` }));
    expect(res.status).toBe(400);
  });

  it('serves bytes with the right content-type and lists metadata', async () => {
    const cookie = makeUser('dave');
    db.insert(tasks).values({ id: 'task-d', userId: 'dave', title: 'D', sortOrder: 1, createdAt: Date.now() }).run();
    const up = await (await api.request('/tasks/task-d/attachments', json(cookie, { dataUrl: PNG_1x1 }))).json();

    const list = await (await api.request('/tasks/task-d/attachments', { headers: { cookie } })).json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(up.id);

    const img = await api.request(`/attachments/${up.id}`, { headers: { cookie } });
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('forbids cross-user read and delete (404)', async () => {
    const owner = makeUser('eve');
    const other = makeUser('mallory');
    db.insert(tasks).values({ id: 'task-e', userId: 'eve', title: 'E', sortOrder: 1, createdAt: Date.now() }).run();
    const up = await (await api.request('/tasks/task-e/attachments', json(owner, { dataUrl: PNG_1x1 }))).json();

    expect((await api.request(`/attachments/${up.id}`, { headers: { cookie: other } })).status).toBe(404);
    expect((await api.request(`/attachments/${up.id}`, { method: 'DELETE', headers: { cookie: other } })).status).toBe(404);
    // owner can delete
    expect((await api.request(`/attachments/${up.id}`, { method: 'DELETE', headers: { cookie: owner } })).status).toBe(200);
    expect((await api.request(`/attachments/${up.id}`, { headers: { cookie: owner } })).status).toBe(404);
  });
});
