import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { CADENCE_PLAN, NEW_DAILY, TEMPLATE_BY_NAME, type PlannedHabit } from './habitPlan';

const dbPath = process.env.TIMER_DB || './timer.db';

export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

/** Create tables if they don't exist. Kept in-app so the container needs no
 *  separate migration step (mirrors the simplicity of the mathtrainer setup). */
export function migrate(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      weekdays_only INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_habit_groups_user ON habit_groups(user_id);

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT,
      name TEXT NOT NULL,
      emoji TEXT,
      note TEXT,
      kind TEXT NOT NULL DEFAULT 'time',
      durations TEXT NOT NULL,
      default_duration_min INTEGER,
      daily_goal_min INTEGER,
      timer_type TEXT NOT NULL DEFAULT 'simple',
      default_timer_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      hidden_on TEXT,
      cadence TEXT NOT NULL DEFAULT 'daily',
      anchor INTEGER,
      anchor_week INTEGER,
      target_count INTEGER NOT NULL DEFAULT 1,
      template TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);

    CREATE TABLE IF NOT EXISTS timers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_timers_user ON timers(user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      habit_id TEXT,
      timer_id TEXT,
      label TEXT,
      type TEXT NOT NULL,
      planned_seconds INTEGER NOT NULL,
      actual_seconds INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 1,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      note TEXT,
      category TEXT NOT NULL DEFAULT 'habit',
      parent_session_id TEXT,
      period_key TEXT,
      entry TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions(user_id, started_at);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      date TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      hidden_on TEXT,
      archived_at INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);

    CREATE TABLE IF NOT EXISTS integrations (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      config TEXT NOT NULL,
      PRIMARY KEY (user_id, kind)
    );

    CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_attachments_user ON task_attachments(user_id);

    CREATE TABLE IF NOT EXISTS rest_days (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rest_days_user_date ON rest_days(user_id, date);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      archived_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_id, created_at);

    CREATE TABLE IF NOT EXISTS vacation_days (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vacation_days_user_date ON vacation_days(user_id, date);

    CREATE TABLE IF NOT EXISTS desktops (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      lane TEXT,
      description TEXT,
      tasks TEXT NOT NULL DEFAULT '[]',
      comments TEXT NOT NULL DEFAULT '[]',
      focused INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      archived_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_desktops_user_sort ON desktops(user_id, sort_order);

    -- One-time data backfills that have already been applied. Keyed per user so
    -- an account created later still receives them, and so a habit the user
    -- deliberately deleted is never resurrected by the next deploy.
    CREATE TABLE IF NOT EXISTS applied_backfills (
      key TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  // Idempotent column additions for databases created before a column existed.
  addColumnIfMissing('habits', 'hidden_on', 'TEXT');
  addColumnIfMissing('tasks', 'hidden_on', 'TEXT');
  addColumnIfMissing('tasks', 'gcal_event_id', 'TEXT');
  addColumnIfMissing('sessions', 'category', "TEXT NOT NULL DEFAULT 'habit'");
  addColumnIfMissing('sessions', 'parent_session_id', 'TEXT');
  addColumnIfMissing('habits', 'anchor_week', 'INTEGER');
  addColumnIfMissing('habits', 'weekend_goal_min', 'INTEGER');
  addColumnIfMissing('habits', 'vacation_goal_min', 'INTEGER');
  addColumnIfMissing('notes', 'archived_at', 'INTEGER');
  addColumnIfMissing('habits', 'anchor', 'INTEGER');
  addColumnIfMissing('habits', 'target_count', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('habits', 'template', 'TEXT');
  addColumnIfMissing('sessions', 'period_key', 'TEXT');
  addColumnIfMissing('sessions', 'entry', 'TEXT');

  addColumnIfMissing('habits', 'cadence', "TEXT NOT NULL DEFAULT 'daily'");

  // Install the weekly/monthly layers once per account. Driven by
  // applied_backfills rather than by "the cadence column was just added",
  // because that fires exactly once for the whole database — which silently
  // skipped every account but one.
  backfillCadencePlan();
  backfillHabitTrim();
  addColumnIfMissing('tasks', 'archived_at', 'INTEGER');

  // Pre-existing DBs: add the flag and mark the conventional 'Work' group once.
  if (addColumnIfMissing('habit_groups', 'weekdays_only', 'INTEGER NOT NULL DEFAULT 0')) {
    sqlite.exec("UPDATE habit_groups SET weekdays_only = 1 WHERE name = 'Work'");
  }

  // Pre-existing DBs: introduce the habit `kind` and, one time only, apply the
  // default daily goals (20 min, 5 for Math Training) and the two end-of-day
  // doomscroll-abstinence habits. New installs get all of this from seed.ts.
  if (addColumnIfMissing('habits', 'kind', "TEXT NOT NULL DEFAULT 'time'")) {
    backfillDefaults();
  }
}

/** One-time backfill for the single pre-existing account: default goals + the
 *  two abstinence habits. No-op on a fresh DB (no user/habits yet → seed runs). */
function backfillDefaults(): void {
  sqlite.exec("UPDATE habits SET daily_goal_min = 20 WHERE daily_goal_min IS NULL AND kind = 'time'");
  sqlite.exec("UPDATE habits SET daily_goal_min = 5 WHERE name = 'Math Training'");

  const user = sqlite.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  if (!user) return;
  const night = sqlite.prepare("SELECT id FROM habit_groups WHERE user_id = ? AND name = 'Night'").get(user.id) as
    | { id: string }
    | undefined;
  const groupId = night?.id ?? null;
  const maxSort = (sqlite.prepare('SELECT MAX(sort_order) AS m FROM habits WHERE user_id = ?').get(user.id) as { m: number | null }).m ?? 0;
  const now = Date.now();
  const insert = sqlite.prepare(
    `INSERT INTO habits (id, user_id, group_id, name, emoji, note, kind, durations, default_duration_min, daily_goal_min, timer_type, default_timer_id, sort_order, archived, hidden_on, created_at)
     VALUES (@id, @userId, @groupId, @name, @emoji, @note, 'abstain', @durations, NULL, NULL, 'simple', NULL, @sortOrder, 0, NULL, @createdAt)`,
  );
  const abstainers = [
    { name: 'App P', emoji: 'phone-off', note: "End of day: confirm you didn't doomscroll" },
    { name: 'App I', emoji: 'phone-off', note: "End of day: confirm you didn't doomscroll" },
  ];
  abstainers.forEach((a, i) => {
    const exists = sqlite.prepare('SELECT 1 FROM habits WHERE user_id = ? AND name = ?').get(user.id, a.name);
    if (exists) return;
    insert.run({
      id: randomBytes(16).toString('hex'),
      userId: user.id,
      groupId,
      name: a.name,
      emoji: a.emoji,
      note: a.note,
      durations: JSON.stringify([20]),
      sortOrder: maxSort + 1 + i,
      createdAt: now,
    });
  });
}

/**
 * Install the three-layer habit plan on every account that has not had it yet:
 * point existing daily habits at their entry forms, then add the habits from
 * {@link CADENCE_PLAN} that are missing.
 *
 * Runs per user, recorded in `applied_backfills`. Two things this must get
 * right: an instance can hold more than one account (an earlier version keyed
 * off `SELECT id FROM users LIMIT 1` and installed the plan on exactly one of
 * them), and a habit the user later deletes must not come back on the next
 * deploy — hence a durable marker rather than "did we just add the column".
 *
 * Additive on purpose: it never archives or deletes anything. Trimming the daily
 * list down is a decision to make in the editor, not a side effect of deploying.
 */
function backfillCadencePlan(): void {
  const users = sqlite.prepare('SELECT id FROM users').all() as { id: string }[];
  const done = sqlite.prepare('SELECT 1 FROM applied_backfills WHERE key = ?');
  const markDone = sqlite.prepare('INSERT OR IGNORE INTO applied_backfills (key, applied_at) VALUES (?, ?)');
  for (const user of users) {
    const key = `cadence-plan-v1:${user.id}`;
    if (done.get(key)) continue;
    installCadencePlan(user.id);
    markDone.run(key, Date.now());
  }
}

/**
 * Bring the accounts that already have the plan into line with the trimmed
 * version of it: no time-repeating notes, a 10-minute floor on the three daily
 * habits, and a monthly ritual anchored to a weekday instead of a number.
 *
 * The plan install above is additive — it skips a habit that already exists —
 * so a change to {@link CADENCE_PLAN} reaches a new machine and nowhere else
 * without this. Recorded per user under its own key, and it runs exactly once:
 * a goal you raise again in the editor afterwards is yours to keep.
 */
function backfillHabitTrim(): void {
  const users = sqlite.prepare('SELECT id FROM users').all() as { id: string }[];
  const done = sqlite.prepare('SELECT 1 FROM applied_backfills WHERE key = ?');
  const markDone = sqlite.prepare('INSERT OR IGNORE INTO applied_backfills (key, applied_at) VALUES (?, ?)');

  const trim = sqlite.prepare(
    `UPDATE habits SET note = NULL, daily_goal_min = @goal, default_duration_min = @goal
     WHERE user_id = @userId AND name = @name`,
  );
  // Only the habits whose note was the goal restated; Music and Courage say
  // something the minutes underneath do not.
  const trimmed = NEW_DAILY.filter((h) => h.note === null && h.dailyGoalMin !== null);

  // Monthly habits still on a day-of-month: move them to the weekday the plan
  // now names, so "the 28th" stops drifting across the week month to month.
  const reanchor = sqlite.prepare(
    `UPDATE habits SET anchor = @anchor, anchor_week = @anchorWeek
     WHERE user_id = @userId AND name = @name AND cadence = 'monthly' AND anchor_week IS NULL`,
  );
  const monthly = CADENCE_PLAN.filter((h) => h.cadence === 'monthly' && h.anchorWeek !== null);

  for (const user of users) {
    const key = `habit-trim-v1:${user.id}`;
    if (done.get(key)) continue;
    for (const h of trimmed) trim.run({ userId: user.id, name: h.name, goal: h.dailyGoalMin });
    for (const h of monthly) reanchor.run({ userId: user.id, name: h.name, anchor: h.anchor, anchorWeek: h.anchorWeek });
    markDone.run(key, Date.now());
  }
}

/** The plan install for one account. Name-matched, so it never duplicates rows. */
function installCadencePlan(userId: string): void {
  const user = { id: userId };

  const setTemplate = sqlite.prepare('UPDATE habits SET template = ? WHERE user_id = ? AND name = ? AND template IS NULL');
  for (const [name, template] of Object.entries(TEMPLATE_BY_NAME)) setTemplate.run(template, user.id, name);

  const groupId = (name: string | null): string | null => {
    if (!name) return null;
    const g = sqlite.prepare('SELECT id FROM habit_groups WHERE user_id = ? AND name = ?').get(user.id, name) as
      | { id: string }
      | undefined;
    return g?.id ?? null;
  };

  const exists = sqlite.prepare('SELECT 1 FROM habits WHERE user_id = ? AND name = ?');
  const insert = sqlite.prepare(
    `INSERT INTO habits (id, user_id, group_id, name, emoji, note, kind, cadence, anchor, anchor_week,
                         target_count, template, durations, default_duration_min, daily_goal_min,
                         timer_type, default_timer_id, sort_order, archived, hidden_on, created_at)
     VALUES (@id, @userId, @groupId, @name, @emoji, @note, @kind, @cadence, @anchor, @anchorWeek,
             @targetCount, @template, @durations, @defaultDurationMin, @dailyGoalMin,
             'simple', NULL, @sortOrder, 0, NULL, @createdAt)`,
  );
  const maxSort = (sqlite.prepare('SELECT MAX(sort_order) AS m FROM habits WHERE user_id = ?').get(user.id) as { m: number | null }).m ?? 0;
  const now = Date.now();

  CADENCE_PLAN.forEach((h: PlannedHabit, i: number) => {
    if (exists.get(user.id, h.name)) return;
    insert.run({
      id: randomBytes(16).toString('hex'),
      userId: user.id,
      groupId: groupId(h.group),
      name: h.name,
      emoji: h.emoji,
      note: h.note,
      kind: h.kind,
      cadence: h.cadence,
      anchor: h.anchor,
      anchorWeek: h.anchorWeek,
      targetCount: h.targetCount,
      template: h.template,
      durations: JSON.stringify(h.durations),
      defaultDurationMin: h.defaultDurationMin,
      dailyGoalMin: h.dailyGoalMin,
      sortOrder: maxSort + 1 + i,
      createdAt: now,
    });
  });
}

/** Add a column only when it's not already present (SQLite ALTER has no IF NOT EXISTS).
 *  Returns true when the column was just added — callers use this to run one-time backfills. */
function addColumnIfMissing(table: string, column: string, type: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    return true;
  }
  return false;
}
