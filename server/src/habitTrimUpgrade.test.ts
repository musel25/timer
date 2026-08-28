import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * An account that already has the cadence plan installed — the production case.
 * `installCadencePlan` skips a habit that exists, so trimming the plan's notes,
 * dropping its goals to 10 and re-anchoring the monthly ritual to a weekday all
 * have to arrive through `backfillHabitTrim` or they reach a new machine only.
 */
const dir = mkdtempSync(join(tmpdir(), 'timer-habit-trim-'));
const file = join(dir, 'installed.db');

const seedDb = new Database(file);
seedDb.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE habits (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT, name TEXT NOT NULL,
    emoji TEXT, note TEXT, kind TEXT NOT NULL DEFAULT 'time', durations TEXT NOT NULL,
    default_duration_min INTEGER, daily_goal_min INTEGER, timer_type TEXT NOT NULL DEFAULT 'simple',
    default_timer_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
    cadence TEXT NOT NULL DEFAULT 'daily', anchor INTEGER, target_count INTEGER NOT NULL DEFAULT 1, template TEXT
  );
  CREATE TABLE applied_backfills (key TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);

  INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'a@b.c', 'x', 0);
  -- The plan as it was installed: notes restating the minutes, 15/20-min goals.
  INSERT INTO habits (id, user_id, name, emoji, note, durations, default_duration_min, daily_goal_min, cadence, created_at)
    VALUES ('p', 'u1', 'Portuguese', 'languages', '15–20 min', '[5,10,15,20,25]', 15, 15, 'daily', 0),
           ('l', 'u1', 'LeetCode', 'swords', '1 problem or 20 min', '[10,15,20]', 20, 20, 'daily', 0),
           ('r', 'u1', 'Read', 'book-open', '20 min', '[10,15,20]', 20, 20, 'daily', 0);
  INSERT INTO habits (id, user_id, name, emoji, note, durations, daily_goal_min, kind, cadence, anchor, target_count, created_at)
    VALUES ('m', 'u1', 'Music', 'guitar', 'Play — it does not have to be productive practice', '[20,30]', 20, 'time', 'weekly', 3, 2, 0),
           ('v', 'u1', 'Life review', 'graduation-cap', 'Rate the nine areas, then the seven questions', '[30]', NULL, 'check', 'monthly', 28, 1, 0);
  -- Already installed, so the additive plan install will not touch these rows.
  INSERT INTO applied_backfills (key, applied_at) VALUES ('cadence-plan-v1:u1', 0);
`);
seedDb.close();
process.env.TIMER_DB = file;

type HabitRow = {
  name: string; note: string | null; daily_goal_min: number | null; default_duration_min: number | null;
  anchor: number | null; anchor_week: number | null;
};

describe('trimming the installed habit plan', () => {
  let sqlite: import('better-sqlite3').Database;
  let migrate: () => void;
  const get = (id: string) =>
    sqlite.prepare('SELECT name, note, daily_goal_min, default_duration_min, anchor, anchor_week FROM habits WHERE id = ?')
      .get(id) as HabitRow;

  beforeAll(async () => {
    const mod = await import('./db');
    sqlite = mod.sqlite;
    migrate = mod.migrate;
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds anchor_week to the existing habits table', () => {
    const names = (sqlite.prepare('PRAGMA table_info(habits)').all() as { name: string }[]).map((c) => c.name);
    expect(names).toContain('anchor_week');
  });

  it('drops the notes that only restated the minutes', () => {
    expect(get('p').note).toBeNull();
    expect(get('l').note).toBeNull();
    expect(get('r').note).toBeNull();
  });

  it('lowers those goals — and the quick-log default — to 10 minutes', () => {
    for (const id of ['p', 'l', 'r']) {
      expect(get(id).daily_goal_min).toBe(10);
      expect(get(id).default_duration_min).toBe(10);
    }
  });

  it('keeps a note that says something the minutes do not', () => {
    expect(get('m').note).toBe('Play — it does not have to be productive practice');
    expect(get('m').daily_goal_min).toBe(20); // Music's per-occurrence floor is untouched
  });

  it('re-anchors the monthly ritual from the 28th to the last Sunday', () => {
    expect(get('v')).toMatchObject({ anchor: 0, anchor_week: 5 });
  });

  it('records the backfill so it never runs a second time', () => {
    expect(sqlite.prepare('SELECT 1 FROM applied_backfills WHERE key = ?').get('habit-trim-v1:u1')).toBeTruthy();
  });

  it('leaves a goal raised again afterwards alone', () => {
    sqlite.prepare('UPDATE habits SET daily_goal_min = 25 WHERE id = ?').run('r');
    migrate(); // a redeploy
    expect(get('r').daily_goal_min).toBe(25);
  });
});
