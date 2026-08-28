import { sqliteTable, text, integer, primaryKey, blob } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  userAgent: text('user_agent'),
});

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
});

export const habitGroups = sqliteTable('habit_groups', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  emoji: text('emoji'),
  weekdaysOnly: integer('weekdays_only', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const habits = sqliteTable('habits', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  groupId: text('group_id'),
  name: text('name').notNull(),
  emoji: text('emoji'),
  note: text('note'),
  // 'time' = run/log in minutes; 'abstain' = end-of-day "stayed off it" check;
  // 'check' = simply done or not, no minutes worth asking for
  kind: text('kind').notNull().default('time'),
  // 'daily' | 'weekly' | 'monthly'. Daily habits sum minutes against a per-day
  // goal; weekly/monthly count occurrences against targetCount.
  cadence: text('cadence').notNull().default('daily'),
  // Weekly: weekday 0-6 (0 = Sunday). Monthly: day of month 1-28. Daily: NULL.
  // Soft — it decides when the habit surfaces, not when it counts.
  anchor: integer('anchor'),
  anchorWeek: integer('anchor_week'),
  targetCount: integer('target_count').notNull().default(1),
  // Which structured entry form a completion opens; NULL = done + a note.
  template: text('template'),
  // number[] of minutes offered, e.g. [5,10,15,20,25,30]
  durations: text('durations', { mode: 'json' }).notNull().$type<number[]>(),
  defaultDurationMin: integer('default_duration_min'),
  dailyGoalMin: integer('daily_goal_min'),
  // Optional lighter goals; NULL = no reduction (use dailyGoalMin that day).
  weekendGoalMin: integer('weekend_goal_min'),
  vacationGoalMin: integer('vacation_goal_min'),
  // Legacy: habits are logged manually and never start a timer, so these two
  // columns are unused by the app. Kept (with their DB defaults) only so old rows
  // and export/import dumps stay valid — do not reference them in new code.
  timerType: text('timer_type').notNull().default('simple'),
  defaultTimerId: text('default_timer_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  // local calendar date 'YYYY-MM-DD' on which this habit was hidden from Today; NULL = not hidden
  hiddenOn: text('hidden_on'),
  createdAt: integer('created_at').notNull(),
});

export const timers = sqliteTable('timers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'simple' | 'interval' | 'pomodoro'
  config: text('config', { mode: 'json' }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  habitId: text('habit_id'),
  timerId: text('timer_id'),
  label: text('label'),
  type: text('type').notNull(), // 'simple' | 'interval'
  plannedSeconds: integer('planned_seconds').notNull(),
  actualSeconds: integer('actual_seconds').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(true),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at').notNull(),
  note: text('note'),
  // Always 'habit' for new rows. 'focus' is legacy — it tagged the removed
  // focus-session "umbrella"; such old rows stay excluded from daily totals.
  category: text('category').notNull().default('habit'),
  // Legacy: unused by the app (nested focus sessions were removed). Column kept
  // dormant so old rows and export/import dumps stay valid.
  parentSessionId: text('parent_session_id'),
  // The period this completion counts toward: '2026-08-28' | '2026-W35' |
  // '2026-08'. Written by the client, which is the only side that knows the
  // user's timezone and therefore which day/week a write belongs to.
  periodKey: text('period_key'),
  // Answers to the habit template's fields, keyed by field id.
  entry: text('entry', { mode: 'json' }).$type<Record<string, string | number>>(),
  createdAt: integer('created_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  notes: text('notes'),
  // local calendar date 'YYYY-MM-DD', or NULL for undated (Inbox)
  date: text('date'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  completedAt: integer('completed_at'),
  // local calendar date 'YYYY-MM-DD' on which this task was hidden from Today; NULL = not hidden
  hiddenOn: text('hidden_on'),
  /** When the task was archived out of the Inbox; NULL while it's still there. */
  archivedAt: integer('archived_at'),
  sortOrder: integer('sort_order').notNull().default(0),
  // Google Calendar event mirroring this task on the Planner calendar, or NULL
  gcalEventId: text('gcal_event_id'),
  createdAt: integer('created_at').notNull(),
});

/** Per-user external-service configs (e.g. kind='gcal'). The config JSON can
 *  hold secrets — API routes must return it only through redactConfig(). */
export const integrations = sqliteTable(
  'integrations',
  {
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    config: text('config', { mode: 'json' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.kind] }) }),
);

/** A whole day the user excused from streaks. One row per (user, date); the
 *  unique (user_id, date) index is created in db.ts so POST can be idempotent. */
export const restDays = sqliteTable('rest_days', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(), // 'YYYY-MM-DD' local key
  createdAt: integer('created_at').notNull(),
});

export const vacationDays = sqliteTable('vacation_days', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(), // 'YYYY-MM-DD' local key — lighter goal, not a skip
  createdAt: integer('created_at').notNull(),
});

/** A quick free-form capture (idea, thought, habit tweak). Tags are parsed from
 *  #hashtags in the text on the client and stored lowercased for filtering. */
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  text: text('text').notNull(),
  tags: text('tags', { mode: 'json' }).notNull().$type<string[]>(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  /** When the note was moved out of the inbox; null while it's still in it. */
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** One card per Ubuntu virtual desktop, mirroring the user's spatial layout.
 *  The displayed number is the row's index+1 in sort_order, so removing one
 *  collapses the numbering exactly like GNOME dynamic workspaces. */
export const desktops = sqliteTable('desktops', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  /** Project tag; colors the chip via categoryColor(lane). */
  lane: text('lane'),
  description: text('description'),
  tasks: text('tasks', { mode: 'json' }).notNull().$type<{ id: string; text: string; done: boolean }[]>(),
  /** Append-only journal, newest first. */
  comments: text('comments', { mode: 'json' }).notNull().$type<{ id: string; text: string; at: number }[]>(),
  /** At most one per user — the desktop you are working on (the pinned card). */
  focused: integer('focused', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull(),
  /** "Done" archives so the journal survives; archived rows are hidden from GET. */
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const taskAttachments = sqliteTable('task_attachments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  taskId: text('task_id').notNull(),
  mime: text('mime').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: integer('created_at').notNull(),
});
