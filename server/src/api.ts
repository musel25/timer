import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from './db';
import { habitGroups, habits, sessions, tasks, timers, userSettings, users } from './schema';
import {
  createSession, currentUserId, destroySession, hashPassword, newId, requireAuth, verifyPassword,
} from './auth';
import { DEFAULT_SETTINGS } from './seed';

type Env = { Variables: { userId: string } };

export const api = new Hono<Env>();

/* ---------- helpers ---------- */
const uid = (c: any) => c.get('userId') as string;
async function body(c: any) {
  try { return await c.req.json(); } catch { return {}; }
}

/* ---------- health ---------- */
api.get('/health', (c) => c.json({ ok: true }));

/* ---------- auth ---------- */
api.post('/auth/login', async (c) => {
  // Note: login email is just an identifier we look up — avoid zod's .email()
  // validator (its regex rejects some valid addresses, e.g. gmail.com).
  const parsed = z.object({ email: z.string().min(1), password: z.string().min(1) }).safeParse(await body(c));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const email = parsed.data.email.toLowerCase();
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  createSession(c, user.id);
  return c.json({ user: { id: user.id, email: user.email } });
});

api.post('/auth/logout', (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

api.get('/auth/me', (c) => {
  const userId = currentUserId(c);
  if (!userId) return c.json({ user: null });
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  return c.json({ user: user ? { id: user.id, email: user.email } : null });
});

api.use('/auth/change-password', requireAuth);
api.post('/auth/change-password', async (c) => {
  const p = z.object({ current: z.string().min(1), next: z.string().min(6) }).safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const user = db.select().from(users).where(eq(users.id, uid(c))).get();
  if (!user || !verifyPassword(p.data.current, user.passwordHash)) return c.json({ error: 'invalid_credentials' }, 401);
  db.update(users).set({ passwordHash: hashPassword(p.data.next) }).where(eq(users.id, user.id)).run();
  return c.json({ ok: true });
});

/* ---------- everything below requires auth ---------- */
api.use('/timers', requireAuth); api.use('/timers/*', requireAuth);
api.use('/habits', requireAuth); api.use('/habits/*', requireAuth);
api.use('/habit-groups', requireAuth); api.use('/habit-groups/*', requireAuth);
api.use('/sessions', requireAuth); api.use('/sessions/*', requireAuth);
api.use('/settings', requireAuth);
api.use('/export', requireAuth); api.use('/import', requireAuth);
api.use('/tasks', requireAuth); api.use('/tasks/*', requireAuth);

/* ---------- timers ---------- */
const timerInput = z.object({
  name: z.string().min(1),
  type: z.enum(['simple', 'interval', 'pomodoro']),
  config: z.any(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

api.get('/timers', (c) =>
  c.json(db.select().from(timers).where(eq(timers.userId, uid(c))).orderBy(asc(timers.sortOrder), asc(timers.createdAt)).all()));

api.post('/timers', async (c) => {
  const p = timerInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), name: p.data.name, type: p.data.type, config: p.data.config,
    sortOrder: p.data.sortOrder ?? now, archived: p.data.archived ?? false, createdAt: now, updatedAt: now,
  };
  db.insert(timers).values(row).run();
  return c.json(row, 201);
});

api.patch('/timers/:id', async (c) => {
  const id = c.req.param('id');
  const p = timerInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const res = db.update(timers).set({ ...p.data, updatedAt: Date.now() })
    .where(and(eq(timers.id, id), eq(timers.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(timers).where(eq(timers.id, id)).get());
});

api.delete('/timers/:id', (c) => {
  db.delete(timers).where(and(eq(timers.id, c.req.param('id')), eq(timers.userId, uid(c)))).run();
  return c.json({ ok: true });
});

/* ---------- habit groups ---------- */
const groupInput = z.object({ name: z.string().min(1), emoji: z.string().nullable().optional(), sortOrder: z.number().int().optional() });

api.get('/habit-groups', (c) =>
  c.json(db.select().from(habitGroups).where(eq(habitGroups.userId, uid(c))).orderBy(asc(habitGroups.sortOrder)).all()));

api.post('/habit-groups', async (c) => {
  const p = groupInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const row = { id: newId(), userId: uid(c), name: p.data.name, emoji: p.data.emoji ?? null, sortOrder: p.data.sortOrder ?? 0 };
  db.insert(habitGroups).values(row).run();
  return c.json(row, 201);
});

api.patch('/habit-groups/:id', async (c) => {
  const id = c.req.param('id');
  const p = groupInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const res = db.update(habitGroups).set(p.data).where(and(eq(habitGroups.id, id), eq(habitGroups.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(habitGroups).where(eq(habitGroups.id, id)).get());
});

api.delete('/habit-groups/:id', (c) => {
  const id = c.req.param('id');
  // Detach habits from the deleted group rather than deleting them.
  db.update(habits).set({ groupId: null }).where(and(eq(habits.groupId, id), eq(habits.userId, uid(c)))).run();
  db.delete(habitGroups).where(and(eq(habitGroups.id, id), eq(habitGroups.userId, uid(c)))).run();
  return c.json({ ok: true });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- habits ---------- */
const habitInput = z.object({
  groupId: z.string().nullable().optional(),
  name: z.string().min(1),
  emoji: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  durations: z.array(z.number().int().positive()).min(1),
  defaultDurationMin: z.number().int().positive().nullable().optional(),
  dailyGoalMin: z.number().int().positive().nullable().optional(),
  timerType: z.enum(['simple', 'interval']).optional(),
  defaultTimerId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
  hiddenOn: z.string().regex(DATE_RE).nullable().optional(),
});

api.get('/habits', (c) =>
  c.json(db.select().from(habits).where(eq(habits.userId, uid(c))).orderBy(asc(habits.sortOrder), asc(habits.createdAt)).all()));

api.post('/habits', async (c) => {
  const p = habitInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const row = {
    id: newId(), userId: uid(c), groupId: p.data.groupId ?? null, name: p.data.name,
    emoji: p.data.emoji ?? null, note: p.data.note ?? null, durations: p.data.durations,
    defaultDurationMin: p.data.defaultDurationMin ?? null, dailyGoalMin: p.data.dailyGoalMin ?? null,
    timerType: p.data.timerType ?? 'simple', defaultTimerId: p.data.defaultTimerId ?? null,
    sortOrder: p.data.sortOrder ?? Date.now(), archived: p.data.archived ?? false, createdAt: Date.now(),
  };
  db.insert(habits).values(row).run();
  return c.json(row, 201);
});

api.patch('/habits/:id', async (c) => {
  const id = c.req.param('id');
  const p = habitInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const res = db.update(habits).set(p.data).where(and(eq(habits.id, id), eq(habits.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(habits).where(eq(habits.id, id)).get());
});

api.delete('/habits/:id', (c) => {
  db.delete(habits).where(and(eq(habits.id, c.req.param('id')), eq(habits.userId, uid(c)))).run();
  return c.json({ ok: true });
});

/* ---------- sessions (the tracking core) ---------- */
const sessionInput = z.object({
  id: z.string().optional(),
  habitId: z.string().nullable().optional(),
  timerId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  type: z.enum(['simple', 'interval']),
  plannedSeconds: z.number().int().nonnegative(),
  actualSeconds: z.number().int().nonnegative(),
  completed: z.boolean().optional(),
  startedAt: z.number().int(),
  endedAt: z.number().int(),
  note: z.string().nullable().optional(),
});

api.get('/sessions', (c) => {
  const now = Date.now();
  const from = Number(c.req.query('from') ?? now - 400 * 24 * 60 * 60 * 1000);
  const to = Number(c.req.query('to') ?? now);
  return c.json(
    db.select().from(sessions)
      .where(and(eq(sessions.userId, uid(c)), gte(sessions.startedAt, from), lte(sessions.startedAt, to)))
      .orderBy(desc(sessions.startedAt)).all(),
  );
});

api.post('/sessions', async (c) => {
  const raw = await body(c);
  const parsed = z.union([sessionInput, z.array(sessionInput)]).safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const now = Date.now();
  const rows = list.map((s) => ({
    id: s.id ?? newId(), userId: uid(c), habitId: s.habitId ?? null, timerId: s.timerId ?? null,
    label: s.label ?? null, type: s.type, plannedSeconds: s.plannedSeconds, actualSeconds: s.actualSeconds,
    completed: s.completed ?? true, startedAt: s.startedAt, endedAt: s.endedAt, note: s.note ?? null, createdAt: now,
  }));
  if (rows.length) db.insert(sessions).values(rows).onConflictDoNothing().run();
  return c.json({ inserted: rows.length, ids: rows.map((r) => r.id) }, 201);
});

api.delete('/sessions/:id', (c) => {
  db.delete(sessions).where(and(eq(sessions.id, c.req.param('id')), eq(sessions.userId, uid(c)))).run();
  return c.json({ ok: true });
});

/* ---------- tasks ---------- */
const taskInput = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  date: z.string().regex(DATE_RE).nullable().optional(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  hiddenOn: z.string().regex(DATE_RE).nullable().optional(),
});

api.get('/tasks', (c) =>
  c.json(
    db.select().from(tasks).where(eq(tasks.userId, uid(c)))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)).all(),
  ));

api.post('/tasks', async (c) => {
  const p = taskInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), title: p.data.title, notes: p.data.notes ?? null,
    date: p.data.date ?? null, done: p.data.done ?? false,
    completedAt: p.data.done ? now : null,
    sortOrder: p.data.sortOrder ?? now, createdAt: now,
  };
  db.insert(tasks).values(row).run();
  return c.json(row, 201);
});

api.patch('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const p = taskInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const patch: Record<string, unknown> = { ...p.data };
  // Keep completedAt in sync when `done` is toggled.
  if (typeof p.data.done === 'boolean') patch.completedAt = p.data.done ? Date.now() : null;
  const res = db.update(tasks).set(patch)
    .where(and(eq(tasks.id, id), eq(tasks.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, uid(c)))).get());
});

api.delete('/tasks/:id', (c) => {
  db.delete(tasks).where(and(eq(tasks.id, c.req.param('id')), eq(tasks.userId, uid(c)))).run();
  return c.json({ ok: true });
});

/* ---------- settings ---------- */
api.get('/settings', (c) => {
  const row = db.select().from(userSettings).where(eq(userSettings.userId, uid(c))).get();
  return c.json({ ...DEFAULT_SETTINGS, ...(row?.data as object | undefined) });
});

api.patch('/settings', async (c) => {
  const incoming = (await body(c)) as Record<string, unknown>;
  const row = db.select().from(userSettings).where(eq(userSettings.userId, uid(c))).get();
  const merged = { ...DEFAULT_SETTINGS, ...(row?.data as object | undefined), ...incoming };
  if (row) db.update(userSettings).set({ data: merged }).where(eq(userSettings.userId, uid(c))).run();
  else db.insert(userSettings).values({ userId: uid(c), data: merged }).run();
  return c.json(merged);
});

/* ---------- export / import ---------- */
api.get('/export', (c) => {
  const u = uid(c);
  return c.json({
    version: 1, exportedAt: Date.now(),
    settings: db.select().from(userSettings).where(eq(userSettings.userId, u)).get()?.data ?? DEFAULT_SETTINGS,
    groups: db.select().from(habitGroups).where(eq(habitGroups.userId, u)).all(),
    habits: db.select().from(habits).where(eq(habits.userId, u)).all(),
    timers: db.select().from(timers).where(eq(timers.userId, u)).all(),
    sessions: db.select().from(sessions).where(eq(sessions.userId, u)).all(),
    tasks: db.select().from(tasks).where(eq(tasks.userId, u)).all(),
  });
});

api.post('/import', async (c) => {
  const u = uid(c);
  const data = (await body(c)) as any;
  const reassign = (rows: any[] = []) => rows.map((r) => ({ ...r, userId: u }));
  db.transaction((tx) => {
    if (Array.isArray(data.groups)) for (const g of reassign(data.groups)) tx.insert(habitGroups).values(g).onConflictDoNothing().run();
    if (Array.isArray(data.timers)) for (const t of reassign(data.timers)) tx.insert(timers).values(t).onConflictDoNothing().run();
    if (Array.isArray(data.habits)) for (const h of reassign(data.habits)) tx.insert(habits).values(h).onConflictDoNothing().run();
    if (Array.isArray(data.sessions)) for (const s of reassign(data.sessions)) tx.insert(sessions).values(s).onConflictDoNothing().run();
    if (Array.isArray(data.tasks)) for (const t of reassign(data.tasks)) tx.insert(tasks).values(t).onConflictDoNothing().run();
    if (data.settings) tx.insert(userSettings).values({ userId: u, data: data.settings })
      .onConflictDoUpdate({ target: userSettings.userId, set: { data: data.settings } }).run();
  });
  return c.json({ ok: true });
});
