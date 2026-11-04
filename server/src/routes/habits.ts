import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { habitGroups, habits } from '../schema';
import { newId } from '../auth';
import { body, uid, DATE_RE, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- habit groups ---------- */
export const groupInput = z.object({
  name: z.string().min(1),
  emoji: z.string().nullable().optional(),
  weekdaysOnly: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

routes.get('/habit-groups', (c) =>
  c.json(db.select().from(habitGroups).where(eq(habitGroups.userId, uid(c))).orderBy(asc(habitGroups.sortOrder)).all()));

routes.post('/habit-groups', async (c) => {
  const p = groupInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const row = { id: newId(), userId: uid(c), name: p.data.name, emoji: p.data.emoji ?? null, weekdaysOnly: p.data.weekdaysOnly ?? false, sortOrder: p.data.sortOrder ?? 0 };
  db.insert(habitGroups).values(row).run();
  return c.json(row, 201);
});

routes.patch('/habit-groups/:id', async (c) => {
  const id = c.req.param('id');
  const p = groupInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const res = db.update(habitGroups).set(p.data).where(and(eq(habitGroups.id, id), eq(habitGroups.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(habitGroups).where(eq(habitGroups.id, id)).get());
});

routes.delete('/habit-groups/:id', (c) => {
  const id = c.req.param('id');
  // Detach habits from the deleted group rather than deleting them.
  db.update(habits).set({ groupId: null }).where(and(eq(habits.groupId, id), eq(habits.userId, uid(c)))).run();
  db.delete(habitGroups).where(and(eq(habitGroups.id, id), eq(habitGroups.userId, uid(c)))).run();
  return c.json({ ok: true });
});


/* ---------- habits ---------- */
export const habitInput = z.object({
  groupId: z.string().nullable().optional(),
  name: z.string().min(1),
  emoji: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  kind: z.enum(['time', 'abstain', 'check']).optional(),
  cadence: z.enum(['daily', 'weekly', 'monthly']).optional(),
  anchor: z.number().int().min(0).max(31).nullable().optional(),
  anchorWeek: z.number().int().min(1).max(5).nullable().optional(),
  targetCount: z.number().int().min(1).max(31).optional(),
  template: z.string().max(40).nullable().optional(),
  durations: z.array(z.number().int().positive()).min(1),
  defaultDurationMin: z.number().int().positive().nullable().optional(),
  dailyGoalMin: z.number().int().positive().nullable().optional(),
  weekendGoalMin: z.number().int().positive().nullable().optional(),
  // 0 is a real answer here — "this habit takes vacation days off" — so it
  // must survive validation, unlike the other goals where 0 means "unset".
  vacationGoalMin: z.number().int().nonnegative().nullable().optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
  hiddenOn: z.string().regex(DATE_RE).nullable().optional(),
});

routes.get('/habits', (c) =>
  c.json(db.select().from(habits).where(eq(habits.userId, uid(c))).orderBy(asc(habits.sortOrder), asc(habits.createdAt)).all()));

routes.post('/habits', async (c) => {
  const p = habitInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const row = {
    id: newId(), userId: uid(c), groupId: p.data.groupId ?? null, name: p.data.name,
    emoji: p.data.emoji ?? null, note: p.data.note ?? null, kind: p.data.kind ?? 'time', durations: p.data.durations,
    defaultDurationMin: p.data.defaultDurationMin ?? null, dailyGoalMin: p.data.dailyGoalMin ?? null,
    weekendGoalMin: p.data.weekendGoalMin ?? null, vacationGoalMin: p.data.vacationGoalMin ?? null,
    cadence: p.data.cadence ?? 'daily', anchor: p.data.anchor ?? null,
    anchorWeek: p.data.anchorWeek ?? null,
    targetCount: p.data.targetCount ?? 1, template: p.data.template ?? null,
    sortOrder: p.data.sortOrder ?? Date.now(), archived: p.data.archived ?? false, createdAt: Date.now(),
  };
  db.insert(habits).values(row).run();
  return c.json(row, 201);
});

routes.patch('/habits/:id', async (c) => {
  const id = c.req.param('id');
  const p = habitInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const res = db.update(habits).set(p.data).where(and(eq(habits.id, id), eq(habits.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(habits).where(eq(habits.id, id)).get());
});

routes.delete('/habits/:id', (c) => {
  db.delete(habits).where(and(eq(habits.id, c.req.param('id')), eq(habits.userId, uid(c)))).run();
  return c.json({ ok: true });
});
