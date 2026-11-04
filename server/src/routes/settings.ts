import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { userSettings } from '../schema';

import { DEFAULT_SETTINGS } from '../seed';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- settings ---------- */
routes.get('/settings', (c) => {
  const row = db.select().from(userSettings).where(eq(userSettings.userId, uid(c))).get();
  return c.json({ ...DEFAULT_SETTINGS, ...(row?.data as object | undefined) });
});

routes.patch('/settings', async (c) => {
  const incoming = (await body(c)) as Record<string, unknown>;
  const row = db.select().from(userSettings).where(eq(userSettings.userId, uid(c))).get();
  const merged = { ...DEFAULT_SETTINGS, ...(row?.data as object | undefined), ...incoming };
  if (row) db.update(userSettings).set({ data: merged }).where(eq(userSettings.userId, uid(c))).run();
  else db.insert(userSettings).values({ userId: uid(c), data: merged }).run();
  return c.json(merged);
});
