import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-hidden-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('hidden_on migration + round-trip', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let tasks: typeof import('./schema').tasks;
  let habits: typeof import('./schema').habits;

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ tasks, habits } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds a hidden_on column to tasks and habits', () => {
    for (const table of ['tasks', 'habits']) {
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('hidden_on');
    }
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('round-trips hiddenOn on a task: set then clear', () => {
    const now = Date.now();
    db.insert(tasks).values({ id: 't1', userId: 'u1', title: 'x', date: '2026-06-10', sortOrder: now, createdAt: now }).run();

    db.update(tasks).set({ hiddenOn: '2026-06-10' }).where(eq(tasks.id, 't1')).run();
    expect(db.select().from(tasks).where(eq(tasks.id, 't1')).get()?.hiddenOn).toBe('2026-06-10');

    db.update(tasks).set({ hiddenOn: null }).where(eq(tasks.id, 't1')).run();
    expect(db.select().from(tasks).where(eq(tasks.id, 't1')).get()?.hiddenOn).toBe(null);
  });

  it('round-trips hiddenOn on a habit', () => {
    const now = Date.now();
    db.insert(habits).values({ id: 'h1', userId: 'u1', name: 'Read', durations: [10], createdAt: now }).run();

    db.update(habits).set({ hiddenOn: '2026-06-10' }).where(eq(habits.id, 'h1')).run();
    expect(db.select().from(habits).where(eq(habits.id, 'h1')).get()?.hiddenOn).toBe('2026-06-10');
  });
});

// Imported lazily-friendly: kept at bottom so the env stub above runs first.
import { eq } from 'drizzle-orm';
