import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { timers } from '../schema';
import { newId } from '../auth';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- timers ---------- */
export const timerInput = z.object({
  name: z.string().min(1),
  type: z.enum(['simple', 'interval', 'pomodoro']),
  config: z.unknown(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

routes.get('/timers', (c) =>
  c.json(db.select().from(timers).where(eq(timers.userId, uid(c))).orderBy(asc(timers.sortOrder), asc(timers.createdAt)).all()));

routes.post('/timers', async (c) => {
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

routes.patch('/timers/:id', async (c) => {
  const id = c.req.param('id');
  const p = timerInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const res = db.update(timers).set({ ...p.data, updatedAt: Date.now() })
    .where(and(eq(timers.id, id), eq(timers.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(timers).where(eq(timers.id, id)).get());
});

routes.delete('/timers/:id', (c) => {
  db.delete(timers).where(and(eq(timers.id, c.req.param('id')), eq(timers.userId, uid(c)))).run();
  return c.json({ ok: true });
});
