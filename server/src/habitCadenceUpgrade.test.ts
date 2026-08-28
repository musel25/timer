import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The production path: a database that already exists without the cadence
 * columns. `CREATE TABLE IF NOT EXISTS` is a no-op against it, so every new
 * column has to arrive through addColumnIfMissing — the case a fresh-DB test
 * silently passes while prod comes up broken.
 */
const dir = mkdtempSync(join(tmpdir(), 'timer-cadence-upgrade-'));
const file = join(dir, 'legacy.db');

// Pre-create the pre-cadence schema, then point db.ts at it.
const seedDb = new Database(file);
seedDb.exec(`
  CREATE TABLE habits (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT, name TEXT NOT NULL,
    emoji TEXT, note TEXT, kind TEXT NOT NULL DEFAULT 'time', durations TEXT NOT NULL,
    default_duration_min INTEGER, daily_goal_min INTEGER, timer_type TEXT NOT NULL DEFAULT 'simple',
    default_timer_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, habit_id TEXT, timer_id TEXT, label TEXT,
    type TEXT NOT NULL, planned_seconds INTEGER NOT NULL, actual_seconds INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 1, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
    note TEXT, created_at INTEGER NOT NULL
  );
  INSERT INTO habits (id, user_id, name, durations, created_at) VALUES ('old', 'u1', 'Anki', '[5,10]', 0);
`);
seedDb.close();
process.env.TIMER_DB = file;

describe('upgrading a pre-cadence database', () => {
  let sqlite: import('better-sqlite3').Database;

  beforeAll(async () => {
    const mod = await import('./db');
    sqlite = mod.sqlite;
    mod.migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds every cadence column to the existing habits table', () => {
    const names = (sqlite.prepare('PRAGMA table_info(habits)').all() as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['cadence', 'anchor', 'target_count', 'template']));
  });

  it('adds the entry columns to the existing sessions table', () => {
    const names = (sqlite.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['period_key', 'entry']));
  });

  it('leaves the pre-existing habit as a plain daily habit', () => {
    const row = sqlite.prepare('SELECT name, cadence, target_count FROM habits WHERE id = ?').get('old');
    expect(row).toEqual({ name: 'Anki', cadence: 'daily', target_count: 1 });
  });
});
