import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-restdays-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('rest_days table + idempotent skip', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let restDays: typeof import('./schema').restDays;

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ restDays } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the rest_days table', () => {
    const cols = sqlite.prepare('PRAGMA table_info(rest_days)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['id', 'user_id', 'date', 'created_at']));
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('marking the same (user, date) twice keeps a single row', () => {
    const now = Date.now();
    db.insert(restDays).values({ id: 'r1', userId: 'u1', date: '2026-06-22', createdAt: now }).onConflictDoNothing().run();
    db.insert(restDays).values({ id: 'r2', userId: 'u1', date: '2026-06-22', createdAt: now }).onConflictDoNothing().run();
    const rows = db.select().from(restDays).where(and(eq(restDays.userId, 'u1'), eq(restDays.date, '2026-06-22'))).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('r1'); // the first write wins; the second is a no-op
  });

  it('scopes rest days per user (same date, different users coexist)', () => {
    const now = Date.now();
    db.insert(restDays).values({ id: 'r3', userId: 'u2', date: '2026-06-22', createdAt: now }).onConflictDoNothing().run();
    const u1 = db.select().from(restDays).where(eq(restDays.userId, 'u1')).all();
    const u2 = db.select().from(restDays).where(eq(restDays.userId, 'u2')).all();
    expect(u1).toHaveLength(1);
    expect(u2).toHaveLength(1);
  });

  it('un-skipping deletes the row', () => {
    db.delete(restDays).where(and(eq(restDays.userId, 'u1'), eq(restDays.date, '2026-06-22'))).run();
    expect(db.select().from(restDays).where(eq(restDays.userId, 'u1')).all()).toHaveLength(0);
  });

  it('requires auth on every /rest-days verb (no cookie → 401)', async () => {
    const { api } = await import('./api');
    expect((await api.request('/rest-days')).status).toBe(401);
    expect((await api.request('/rest-days', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await api.request('/rest-days/2026-06-22', { method: 'DELETE' })).status).toBe(401);
  });
});

// Imported at the bottom so the TIMER_DB env stub above runs first.
import { and, eq } from 'drizzle-orm';
