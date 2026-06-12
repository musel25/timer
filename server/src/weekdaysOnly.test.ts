import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-weekdays-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('weekdays_only migration + backfill', () => {
  let sqlite: import('better-sqlite3').Database;
  let migrate: typeof import('./db').migrate;

  beforeAll(async () => {
    ({ sqlite, migrate } = await import('./db'));
    // Simulate a database created before the column existed, with live rows.
    sqlite.exec(`
      CREATE TABLE habit_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO habit_groups (id, user_id, name) VALUES
        ('g-work', 'u1', 'Work'),
        ('g-morning', 'u1', 'Morning');
    `);
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const flag = (id: string) =>
    (sqlite.prepare('SELECT weekdays_only AS w FROM habit_groups WHERE id = ?').get(id) as { w: number }).w;

  it('adds the weekdays_only column', () => {
    const cols = sqlite.prepare('PRAGMA table_info(habit_groups)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('weekdays_only');
  });

  it('backfills weekdays_only=1 for groups named Work', () => {
    expect(flag('g-work')).toBe(1);
  });

  it('leaves other groups at 0', () => {
    expect(flag('g-morning')).toBe(0);
  });

  it('does not re-apply the backfill once the column exists', () => {
    sqlite.exec("UPDATE habit_groups SET weekdays_only = 0 WHERE id = 'g-work'");
    migrate(); // idempotent — column already present, so no backfill
    expect(flag('g-work')).toBe(0);
  });
});
