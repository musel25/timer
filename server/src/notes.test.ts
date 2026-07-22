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

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ notes } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the notes table', () => {
    const cols = sqlite.prepare('PRAGMA table_info(notes)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['id', 'user_id', 'text', 'tags', 'pinned', 'created_at', 'updated_at']),
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
