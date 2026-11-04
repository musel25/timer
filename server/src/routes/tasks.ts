import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { tasks, taskAttachments } from '../schema';
import { newId } from '../auth';
import { queueTaskDelete, queueTaskSync } from '../gcalSync';
import { body, uid, DATE_RE, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- tasks ---------- */
export const taskInput = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  date: z.string().regex(DATE_RE).nullable().optional(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  hiddenOn: z.string().regex(DATE_RE).nullable().optional(),
  archivedAt: z.number().nullable().optional(),
});

routes.get('/tasks', (c) => {
  const u = uid(c);
  const rows = db.select().from(tasks).where(eq(tasks.userId, u))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)).all();
  const counts = db
    .select({ taskId: taskAttachments.taskId, n: sql<number>`count(*)` })
    .from(taskAttachments).where(eq(taskAttachments.userId, u))
    .groupBy(taskAttachments.taskId).all();
  const byTask = new Map(counts.map((r) => [r.taskId, Number(r.n)]));
  return c.json(rows.map((r) => ({ ...r, attachmentCount: byTask.get(r.id) ?? 0 })));
});

routes.post('/tasks', async (c) => {
  const p = taskInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), title: p.data.title, notes: p.data.notes ?? null,
    date: p.data.date ?? null, done: p.data.done ?? false,
    completedAt: p.data.done ? now : null, archivedAt: p.data.archivedAt ?? null,
    sortOrder: p.data.sortOrder ?? now, createdAt: now,
  };
  db.insert(tasks).values(row).run();
  queueTaskSync(uid(c), row.id);
  return c.json(row, 201);
});

/** Whole-column reorder: `ids` is the column's full order, top to bottom.
 *  One call rather than N task PATCHes because every PATCH fires a gcal sync,
 *  and Calendar cannot see sortOrder — only a real date change is worth a push. */
const reorderInput = z.object({
  date: z.string().regex(DATE_RE).nullable(),
  ids: z.array(z.string()),
});

routes.post('/tasks/reorder', async (c) => {
  const p = reorderInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const u = uid(c);
  const { date, ids } = p.data;

  // Ids the client no longer owns (deleted elsewhere, or another user's) are
  // skipped, not rejected: a stale board must not 500, and must not reach
  // across users. They still consume their index, so the rest keep their gaps.
  const owned = new Map(
    db.select().from(tasks).where(eq(tasks.userId, u)).all().map((t) => [t.id, t]),
  );
  const moved: string[] = [];
  db.transaction((tx) => {
    ids.forEach((id, i) => {
      const row = owned.get(id);
      if (!row) return;
      tx.update(tasks).set({ date, sortOrder: i })
        .where(and(eq(tasks.id, id), eq(tasks.userId, u))).run();
      if (row.date !== date) moved.push(id);
    });
  });
  for (const id of moved) queueTaskSync(u, id);
  return c.json({ ok: true });
});

routes.patch('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const p = taskInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const patch: Record<string, unknown> = { ...p.data };
  // Keep completedAt in sync when `done` is toggled.
  if (typeof p.data.done === 'boolean') patch.completedAt = p.data.done ? Date.now() : null;
  const res = db.update(tasks).set(patch)
    .where(and(eq(tasks.id, id), eq(tasks.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  queueTaskSync(uid(c), id);
  return c.json(db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, uid(c)))).get());
});

routes.delete('/tasks/:id', (c) => {
  const id = c.req.param('id');
  const u = uid(c);
  const row = db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, u))).get();
  db.delete(taskAttachments).where(and(eq(taskAttachments.taskId, id), eq(taskAttachments.userId, u))).run();
  db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, u))).run();
  queueTaskDelete(u, row?.gcalEventId ?? null);
  return c.json({ ok: true });
});
