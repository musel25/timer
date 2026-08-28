import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CADENCE_PLAN, MONTHLY, WEEKLY } from './habitPlan';

/**
 * The production upgrade: an account that already has the nine original habits
 * and years of sessions. The backfill must add the new layers without touching
 * what is already there.
 */
const dir = mkdtempSync(join(tmpdir(), 'timer-plan-'));
const file = join(dir, 'legacy.db');

const seedDb = new Database(file);
seedDb.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE habit_groups (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, emoji TEXT,
    weekdays_only INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE habits (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT, name TEXT NOT NULL,
    emoji TEXT, note TEXT, kind TEXT NOT NULL DEFAULT 'time', durations TEXT NOT NULL,
    default_duration_min INTEGER, daily_goal_min INTEGER, timer_type TEXT NOT NULL DEFAULT 'simple',
    default_timer_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  INSERT INTO users VALUES ('u1', 'me@example.com', 'x', 0);
  INSERT INTO users VALUES ('u2', 'someone-else@example.com', 'x', 0);
  INSERT INTO habit_groups (id, user_id, name, sort_order) VALUES ('g-night', 'u1', 'Night', 2);
  INSERT INTO habits (id, user_id, group_id, name, durations, daily_goal_min, sort_order, created_at)
    VALUES ('h-journal', 'u1', 'g-night', 'Journaling', '[5,10]', 20, 5, 0),
           ('h-read', 'u1', 'g-night', 'Reading', '[10,20]', 20, 6, 0),
           ('h-anki', 'u1', NULL, 'Anki', '[5,10]', 20, 2, 0);
`);
seedDb.close();
process.env.TIMER_DB = file;

describe('installing the cadence plan on an existing account', () => {
  let sqlite: import('better-sqlite3').Database;
  let migrate: typeof import('./db').migrate;

  const habitNamed = (name: string, userId = 'u1') =>
    sqlite.prepare('SELECT * FROM habits WHERE name = ? AND user_id = ?').get(name, userId) as
      | Record<string, unknown>
      | undefined;

  beforeAll(async () => {
    ({ sqlite, migrate } = await import('./db'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds every planned habit', () => {
    for (const h of CADENCE_PLAN) expect(habitNamed(h.name), h.name).toBeDefined();
  });

  it('gives weekly habits their cadence, anchor and target', () => {
    expect(habitNamed('Nature')).toMatchObject({ cadence: 'weekly', anchor: 6, target_count: 1, kind: 'time', daily_goal_min: 30 });
    expect(habitNamed('Music')).toMatchObject({ cadence: 'weekly', target_count: 2, daily_goal_min: 20 });
    expect(habitNamed('Weekly review')).toMatchObject({ cadence: 'weekly', anchor: 0, template: 'weekly-review' });
  });

  it('spreads monthly anchors so they never land on the same day', () => {
    const anchors = MONTHLY.map((h) => (habitNamed(h.name) as { anchor: number }).anchor);
    expect(new Set(anchors).size).toBe(MONTHLY.length);
    expect(anchors.every((a) => a >= 1 && a <= 28)).toBe(true);
  });

  it('spreads weekly anchors across distinct weekdays', () => {
    const anchors = WEEKLY.map((h) => (habitNamed(h.name) as { anchor: number }).anchor);
    expect(new Set(anchors).size).toBe(WEEKLY.length);
  });

  it('points the pre-existing daily habits at their entry forms', () => {
    expect(habitNamed('Journaling')).toMatchObject({ template: 'journal' });
    expect(habitNamed('Reading')).toMatchObject({ template: 'read' });
  });

  it('leaves untouched habits alone', () => {
    // Additive only: trimming the daily list is a decision for the editor, not
    // a side effect of deploying.
    expect(habitNamed('Anki')).toMatchObject({ template: null, cadence: 'daily', archived: 0, daily_goal_min: 20 });
  });

  it('puts Portuguese in the Night group alongside the other evening study', () => {
    expect(habitNamed('Portuguese')).toMatchObject({ cadence: 'daily', group_id: 'g-night', daily_goal_min: 15 });
  });

  it('leaves weekly and monthly habits ungrouped', () => {
    for (const h of [...WEEKLY, ...MONTHLY]) expect(habitNamed(h.name)).toMatchObject({ group_id: null });
  });

  it('installs the plan on every account, not just the first', () => {
    // A production instance held two accounts; keying the backfill off
    // `SELECT id FROM users LIMIT 1` gave the whole plan to one of them and the
    // active account nothing.
    for (const h of CADENCE_PLAN) expect(habitNamed(h.name, 'u2'), `${h.name} for u2`).toBeDefined();
  });

  it('does not duplicate rows when migrate runs again', () => {
    migrate();
    migrate();
    const count = sqlite.prepare('SELECT COUNT(*) AS n FROM habits').get() as { n: number };
    expect(count.n).toBe(3 + CADENCE_PLAN.length * 2); // three legacy habits, plan installed for both users
  });

  it('does not resurrect a habit the user deleted', () => {
    // The marker is durable, so a later deploy must not bring Nature back.
    sqlite.prepare("DELETE FROM habits WHERE name = 'Nature' AND user_id = 'u1'").run();
    migrate();
    expect(habitNamed('Nature', 'u1')).toBeUndefined();
  });
});
