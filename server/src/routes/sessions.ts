import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { sessions } from '../schema';
import { newId } from '../auth';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- sessions (the tracking core) ---------- */
export const sessionInput = z.object({
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
  category: z.enum(['habit', 'focus']).optional(), // 'focus' accepted only for legacy/import data
  // Client-computed: only the browser knows the user's timezone, so only it can
  // say which day/week/month a completion belongs to.
  periodKey: z.string().max(20).nullable().optional(),
  entry: z.record(z.union([z.string(), z.number()])).nullable().optional(),
});

routes.get('/sessions', (c) => {
  const now = Date.now();
  const from = Number(c.req.query('from') ?? now - 400 * 24 * 60 * 60 * 1000);
  const to = Number(c.req.query('to') ?? now);
  return c.json(
    db.select().from(sessions)
      .where(and(eq(sessions.userId, uid(c)), gte(sessions.startedAt, from), lte(sessions.startedAt, to)))
      .orderBy(desc(sessions.startedAt)).all(),
  );
});

routes.post('/sessions', async (c) => {
  const raw = await body(c);
  const parsed = z.union([sessionInput, z.array(sessionInput)]).safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const now = Date.now();
  const rows = list.map((s) => ({
    id: s.id ?? newId(), userId: uid(c), habitId: s.habitId ?? null, timerId: s.timerId ?? null,
    label: s.label ?? null, type: s.type, plannedSeconds: s.plannedSeconds, actualSeconds: s.actualSeconds,
    completed: s.completed ?? true, startedAt: s.startedAt, endedAt: s.endedAt, note: s.note ?? null,
    category: s.category ?? 'habit', periodKey: s.periodKey ?? null, entry: s.entry ?? null, createdAt: now,
  }));
  if (rows.length) db.insert(sessions).values(rows).onConflictDoNothing().run();
  return c.json({ inserted: rows.length, ids: rows.map((r) => r.id) }, 201);
});

routes.delete('/sessions/:id', (c) => {
  db.delete(sessions).where(and(eq(sessions.id, c.req.param('id')), eq(sessions.userId, uid(c)))).run();
  return c.json({ ok: true });
});
