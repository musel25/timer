import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-notes-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('notes table + CRUD scoping', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let notes: typeof import('./schema').notes;
  let api: typeof import('./api').api;

  // Insert a user + a live auth session; return a Cookie header for it.
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
    ({ sqlite, db, migrate } = await import('./db'));
    ({ notes } = await import('./schema'));
    ({ api } = await import('./api'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the notes table', () => {
    const cols = sqlite.prepare('PRAGMA table_info(notes)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'text', 'tags', 'pinned', 'created_at', 'updated_at', 'archived_at',
      ]),
    );
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('round-trips tags as a JSON string array', () => {
    const now = Date.now();
    db.insert(notes).values({
      id: 'n1', userId: 'u1', text: 'drink water after coffee #habits',
      tags: ['habits'], pinned: false, createdAt: now, updatedAt: now,
    }).run();
    const row = db.select().from(notes).where(eq(notes.id, 'n1')).get();
    expect(row?.tags).toEqual(['habits']);
    expect(row?.pinned).toBe(false);
  });

  it('scopes notes per user', () => {
    const now = Date.now();
    db.insert(notes).values({
      id: 'n2', userId: 'u2', text: 'other user note', tags: [], pinned: false, createdAt: now, updatedAt: now,
    }).run();
    expect(db.select().from(notes).where(eq(notes.userId, 'u1')).all()).toHaveLength(1);
    expect(db.select().from(notes).where(eq(notes.userId, 'u2')).all()).toHaveLength(1);
  });

  it('archives a note: stamps archivedAt, drops the pin, keeps it in GET /notes', async () => {
    const cookie = await makeUser('dana');
    const created = await (await api.request('/notes', send('POST', cookie, {
      text: 'maybe drop this #someday', tags: ['someday'], pinned: true,
    }))).json();
    expect(created.archivedAt).toBeNull();

    const at = Date.now();
    const archived = await (await api.request(
      `/notes/${created.id}`, send('PATCH', cookie, { archivedAt: at, pinned: false }),
    )).json();
    expect(archived.archivedAt).toBe(at);
    expect(archived.pinned).toBe(false);

    // Archived notes still come back — the client decides what to show.
    const all = await (await api.request('/notes', { headers: { cookie } })).json();
    expect(all.map((n: { id: string }) => n.id)).toContain(created.id);
  });

  it('unarchives a note by nulling archivedAt', async () => {
    const cookie = await makeUser('erin');
    const created = await (await api.request('/notes', send('POST', cookie, { text: 'back to inbox' }))).json();
    await api.request(`/notes/${created.id}`, send('PATCH', cookie, { archivedAt: Date.now() }));

    const restored = await (await api.request(
      `/notes/${created.id}`, send('PATCH', cookie, { archivedAt: null }),
    )).json();
    expect(restored.archivedAt).toBeNull();
  });

  it('requires auth on every /notes verb (no cookie → 401)', async () => {
    const { api } = await import('./api');
    expect((await api.request('/notes')).status).toBe(401);
    expect((await api.request('/notes', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await api.request('/notes/n1', { method: 'PATCH', body: '{}' })).status).toBe(401);
    expect((await api.request('/notes/n1', { method: 'DELETE' })).status).toBe(401);
  });
});

// Imported at the bottom so the TIMER_DB env stub above runs first.
import { eq } from 'drizzle-orm';
