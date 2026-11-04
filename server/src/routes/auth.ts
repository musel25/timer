import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../schema';
import { createSession, currentUserId, destroySession, hashPassword, verifyPassword } from '../auth';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- auth ---------- */
routes.post('/auth/login', async (c) => {
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

routes.post('/auth/logout', (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

routes.get('/auth/me', (c) => {
  const userId = currentUserId(c);
  if (!userId) return c.json({ user: null });
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  return c.json({ user: user ? { id: user.id, email: user.email } : null });
});

routes.post('/auth/change-password', async (c) => {
  const p = z.object({ current: z.string().min(1), next: z.string().min(6) }).safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const user = db.select().from(users).where(eq(users.id, uid(c))).get();
  if (!user || !verifyPassword(p.data.current, user.passwordHash)) return c.json({ error: 'invalid_credentials' }, 401);
  db.update(users).set({ passwordHash: hashPassword(p.data.next) }).where(eq(users.id, user.id)).run();
  return c.json({ ok: true });
});
