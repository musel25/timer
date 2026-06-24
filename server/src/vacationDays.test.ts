import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-vacationdays-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('vacation_days table + habit goal columns', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let vacationDays: typeof import('./schema').vacationDays;

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ vacationDays } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the vacation_days table', () => {
    const cols = sqlite.prepare('PRAGMA table_info(vacation_days)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['id', 'user_id', 'date', 'created_at']));
  });

  it('adds weekend_goal_min and vacation_goal_min columns to habits', () => {
    const cols = sqlite.prepare('PRAGMA table_info(habits)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['weekend_goal_min', 'vacation_goal_min']));
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('marking the same (user, date) twice keeps a single row', () => {
    const now = Date.now();
    db.insert(vacationDays).values({ id: 'v1', userId: 'u1', date: '2026-07-01', createdAt: now }).onConflictDoNothing().run();
    db.insert(vacationDays).values({ id: 'v2', userId: 'u1', date: '2026-07-01', createdAt: now }).onConflictDoNothing().run();
    const rows = db.select().from(vacationDays).where(and(eq(vacationDays.userId, 'u1'), eq(vacationDays.date, '2026-07-01'))).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('v1');
  });

  it('requires auth on every /vacation-days verb (no cookie → 401)', async () => {
    const { api } = await import('./api');
    expect((await api.request('/vacation-days')).status).toBe(401);
    expect((await api.request('/vacation-days', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await api.request('/vacation-days/2026-07-01', { method: 'DELETE' })).status).toBe(401);
  });
});

// Imported at the bottom so the TIMER_DB env stub above runs first.
import { and, eq } from 'drizzle-orm';
