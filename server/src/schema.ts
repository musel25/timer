import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

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
  // 'time' = run/log in minutes; 'abstain' = end-of-day "stayed off it" check
  kind: text('kind').notNull().default('time'),
  // number[] of minutes offered, e.g. [5,10,15,20,25,30]
  durations: text('durations', { mode: 'json' }).notNull().$type<number[]>(),
  defaultDurationMin: integer('default_duration_min'),
  dailyGoalMin: integer('daily_goal_min'),
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
