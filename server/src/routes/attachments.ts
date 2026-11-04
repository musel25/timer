import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { tasks, taskAttachments } from '../schema';
import { newId } from '../auth';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- task attachments (pasted images) ---------- */
const ATTACH_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;
const MAX_ATTACH_BYTES = 3 * 1024 * 1024;
const attachInput = z.object({
  dataUrl: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

routes.post('/tasks/:id/attachments', async (c) => {
  const taskId = c.req.param('id');
  const u = uid(c);
  const task = db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, u))).get();
  if (!task) return c.json({ error: 'not_found' }, 404);

  const p = attachInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const m = ATTACH_DATA_URL_RE.exec(p.data.dataUrl);
  if (!m) return c.json({ error: 'invalid_image' }, 400);
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > MAX_ATTACH_BYTES) return c.json({ error: 'too_large' }, 400);

  const meta = {
    id: newId(), taskId, mime,
    width: p.data.width ?? null, height: p.data.height ?? null,
    createdAt: Date.now(),
  };
  db.insert(taskAttachments).values({ ...meta, userId: u, data: buf }).run();
  return c.json(meta, 201);
});

routes.get('/tasks/:id/attachments', (c) => {
  const taskId = c.req.param('id');
  const u = uid(c);
  const rows = db
    .select({
      id: taskAttachments.id, taskId: taskAttachments.taskId, mime: taskAttachments.mime,
      width: taskAttachments.width, height: taskAttachments.height, createdAt: taskAttachments.createdAt,
    })
    .from(taskAttachments)
    .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.userId, u)))
    .orderBy(asc(taskAttachments.createdAt))
    .all();
  return c.json(rows);
});

routes.get('/attachments/:id', (c) => {
  const id = c.req.param('id');
  const u = uid(c);
  const row = db.select().from(taskAttachments)
    .where(and(eq(taskAttachments.id, id), eq(taskAttachments.userId, u))).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return new Response(new Uint8Array(row.data as Buffer), {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
});

routes.delete('/attachments/:id', (c) => {
  const id = c.req.param('id');
  const u = uid(c);
  const res = db.delete(taskAttachments)
    .where(and(eq(taskAttachments.id, id), eq(taskAttachments.userId, u))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
