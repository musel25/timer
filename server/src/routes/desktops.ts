import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../db';
import { desktops } from '../schema';
import { newId } from '../auth';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- desktops (one card per Ubuntu workspace) ---------- */
const desktopSubtask = z.object({ id: z.string(), text: z.string().min(1), done: z.boolean() });
const desktopTask = desktopSubtask.extend({ subtasks: z.array(desktopSubtask).optional() });
const desktopComment = z.object({ id: z.string(), text: z.string().min(1), at: z.number() });
export const desktopInput = z.object({
  title: z.string().min(1),
  lane: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tasks: z.array(desktopTask).optional(),
  comments: z.array(desktopComment).optional(),
  focused: z.boolean().optional(),
  sortOrder: z.number().optional(),
  archivedAt: z.number().nullable().optional(),
});

/** Keep 'at most one focused per user' true even when two tabs race. */
function demoteOtherFocused(userId: string, keepId: string, now: number): void {
  db.update(desktops).set({ focused: false, updatedAt: now })
    .where(and(eq(desktops.userId, userId), ne(desktops.id, keepId), eq(desktops.focused, true)))
    .run();
}

routes.get('/desktops', (c) =>
  c.json(db.select().from(desktops)
    .where(and(eq(desktops.userId, uid(c)), isNull(desktops.archivedAt)))
    .orderBy(asc(desktops.sortOrder), asc(desktops.createdAt)).all()));

routes.post('/desktops', async (c) => {
  const p = desktopInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), title: p.data.title,
    lane: p.data.lane ?? null, description: p.data.description ?? null,
    tasks: p.data.tasks ?? [], comments: p.data.comments ?? [],
    focused: p.data.focused ?? false, sortOrder: p.data.sortOrder ?? now,
    archivedAt: p.data.archivedAt ?? null, createdAt: now, updatedAt: now,
  };
  db.insert(desktops).values(row).run();
  if (row.focused) demoteOtherFocused(row.userId, row.id, now);
  return c.json(row, 201);
});

routes.patch('/desktops/:id', async (c) => {
  const id = c.req.param('id');
  const p = desktopInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const res = db.update(desktops).set({ ...p.data, updatedAt: now })
    .where(and(eq(desktops.id, id), eq(desktops.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  if (p.data.focused === true) demoteOtherFocused(uid(c), id, now);
  return c.json(db.select().from(desktops).where(and(eq(desktops.id, id), eq(desktops.userId, uid(c)))).get());
});

routes.delete('/desktops/:id', (c) => {
  const res = db.delete(desktops)
    .where(and(eq(desktops.id, c.req.param('id')), eq(desktops.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
