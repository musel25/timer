import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { notes } from '../schema';
import { newId } from '../auth';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- notes (quick capture) ---------- */
export const noteInput = z.object({
  text: z.string().min(1),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  archivedAt: z.number().nullable().optional(),
});

routes.get('/notes', (c) => {
  const rows = db.select().from(notes).where(eq(notes.userId, uid(c)))
    .orderBy(desc(notes.pinned), desc(notes.createdAt)).all();
  return c.json(rows);
});

routes.post('/notes', async (c) => {
  const p = noteInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), text: p.data.text,
    tags: p.data.tags ?? [], pinned: p.data.pinned ?? false,
    archivedAt: p.data.archivedAt ?? null,
    createdAt: now, updatedAt: now,
  };
  db.insert(notes).values(row).run();
  return c.json(row, 201);
});

routes.patch('/notes/:id', async (c) => {
  const id = c.req.param('id');
  const p = noteInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const res = db.update(notes).set({ ...p.data, updatedAt: Date.now() })
    .where(and(eq(notes.id, id), eq(notes.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(notes).where(and(eq(notes.id, id), eq(notes.userId, uid(c)))).get());
});

routes.delete('/notes/:id', (c) => {
  const res = db.delete(notes)
    .where(and(eq(notes.id, c.req.param('id')), eq(notes.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
