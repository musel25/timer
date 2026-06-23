import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

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
  `);

  // Idempotent column additions for databases created before a column existed.
  addColumnIfMissing('habits', 'hidden_on', 'TEXT');
  addColumnIfMissing('tasks', 'hidden_on', 'TEXT');
  addColumnIfMissing('tasks', 'gcal_event_id', 'TEXT');
  addColumnIfMissing('sessions', 'category', "TEXT NOT NULL DEFAULT 'habit'");
  addColumnIfMissing('sessions', 'parent_session_id', 'TEXT');

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
