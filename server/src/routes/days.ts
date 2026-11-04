import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { restDays, vacationDays } from '../schema';
import { newId } from '../auth';
import { datesInclusive } from '../range';
import { body, uid, DATE_RE, type ApiEnv, type ApiContext } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- vacation / rest day ranges (bulk) ---------- */
// Exported so the insert/delete logic is unit-testable without the HTTP layer.
export function applyVacationRange(userId: string, start: string, end: string, on: boolean) {
  const days = datesInclusive(start, end);
  if (on) {
    const now = Date.now();
    for (const date of days)
      db.insert(vacationDays).values({ id: newId(), userId, date, createdAt: now }).onConflictDoNothing().run();
  } else {
    for (const date of days)
      db.delete(vacationDays).where(and(eq(vacationDays.userId, userId), eq(vacationDays.date, date))).run();
  }
  return days;
}
export function applyRestRange(userId: string, start: string, end: string, on: boolean) {
  const days = datesInclusive(start, end);
  if (on) {
    const now = Date.now();
    for (const date of days)
      db.insert(restDays).values({ id: newId(), userId, date, createdAt: now }).onConflictDoNothing().run();
  } else {
    for (const date of days)
      db.delete(restDays).where(and(eq(restDays.userId, userId), eq(restDays.date, date))).run();
  }
  return days;
}

const rangeBody = z.object({ start: z.string().regex(DATE_RE), end: z.string().regex(DATE_RE) });
function rangeRoute(apply: (userId: string, s: string, e: string, on: boolean) => string[], on: boolean) {
  return async (c: ApiContext) => {
    const p = rangeBody.safeParse(await body(c));
    if (!p.success) return c.json({ error: 'invalid_input' }, 400);
    try {
      const days = apply(uid(c), p.data.start, p.data.end, on);
      return c.json({ ok: true, count: days.length });
    } catch {
      return c.json({ error: 'invalid_range' }, 400);
    }
  };
}

/* ---------- rest days (whole-day streak skips) ---------- */
// `/range` routes are registered before `/:date` so 'range' is not captured as a date param.
routes.post('/rest-days/range', rangeRoute(applyRestRange, true));
routes.delete('/rest-days/range', rangeRoute(applyRestRange, false));
routes.post('/vacation-days/range', rangeRoute(applyVacationRange, true));
routes.delete('/vacation-days/range', rangeRoute(applyVacationRange, false));

routes.get('/rest-days', (c) =>
  c.json(db.select().from(restDays).where(eq(restDays.userId, uid(c))).orderBy(desc(restDays.date)).all()));

routes.post('/rest-days', async (c) => {
  const p = z.object({ date: z.string().regex(DATE_RE) }).safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const existing = db.select().from(restDays).where(and(eq(restDays.userId, uid(c)), eq(restDays.date, p.data.date))).get();
  if (existing) return c.json(existing); // idempotent: marking an already-rest day is a no-op
  const row = { id: newId(), userId: uid(c), date: p.data.date, createdAt: Date.now() };
  db.insert(restDays).values(row).onConflictDoNothing().run();
  return c.json(row, 201);
});

routes.delete('/rest-days/:date', (c) => {
  db.delete(restDays).where(and(eq(restDays.userId, uid(c)), eq(restDays.date, c.req.param('date')))).run();
  return c.json({ ok: true });
});

/* ---------- vacation days (whole-day lighter goal, still streak-keeping) ---------- */
routes.get('/vacation-days', (c) =>
  c.json(db.select().from(vacationDays).where(eq(vacationDays.userId, uid(c))).orderBy(desc(vacationDays.date)).all()));

routes.post('/vacation-days', async (c) => {
  const p = z.object({ date: z.string().regex(DATE_RE) }).safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const existing = db.select().from(vacationDays).where(and(eq(vacationDays.userId, uid(c)), eq(vacationDays.date, p.data.date))).get();
  if (existing) return c.json(existing); // idempotent
  const row = { id: newId(), userId: uid(c), date: p.data.date, createdAt: Date.now() };
  db.insert(vacationDays).values(row).onConflictDoNothing().run();
  return c.json(row, 201);
});

routes.delete('/vacation-days/:date', (c) => {
  db.delete(vacationDays).where(and(eq(vacationDays.userId, uid(c)), eq(vacationDays.date, c.req.param('date')))).run();
  return c.json({ ok: true });
});
