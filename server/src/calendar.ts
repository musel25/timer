import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { integrations } from './schema';
import { clearEventsCache, listEvents, redactConfig, testCalendar, type GcalConfig } from './gcal';

type Env = { Variables: { userId: string } };
const uid = (c: { get(k: 'userId'): string }) => c.get('userId');

export function getGcalConfig(userId: string): GcalConfig | null {
  const row = db.select().from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, 'gcal'))).get();
  return (row?.config as GcalConfig | undefined) ?? null;
}

export const calendar = new Hono<Env>();

calendar.get('/config', (c) => c.json(redactConfig(getGcalConfig(uid(c)))));

const configInput = z.object({
  serviceAccountJson: z.string().min(1).optional(), // omitted = keep the stored key
  readCalendarIds: z.array(z.string().min(1)).optional(),
  pushCalendarId: z.string().min(1).nullable().optional(),
});

calendar.put('/config', async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = {}; }
  const p = configInput.safeParse(raw);
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const prev = getGcalConfig(uid(c));
  const next: GcalConfig = {
    serviceAccountJson: p.data.serviceAccountJson ?? prev?.serviceAccountJson ?? '',
    readCalendarIds: p.data.readCalendarIds ?? prev?.readCalendarIds ?? [],
    pushCalendarId: p.data.pushCalendarId !== undefined ? p.data.pushCalendarId : (prev?.pushCalendarId ?? null),
  };
  try {
    const key = JSON.parse(next.serviceAccountJson);
    if (!key.client_email || !key.private_key) return c.json({ error: 'invalid_key' }, 400);
  } catch {
    return c.json({ error: 'invalid_key' }, 400);
  }
  db.insert(integrations)
    .values({ userId: uid(c), kind: 'gcal', config: next })
    .onConflictDoUpdate({ target: [integrations.userId, integrations.kind], set: { config: next } })
    .run();
  clearEventsCache();
  return c.json(redactConfig(next));
});

calendar.delete('/config', (c) => {
  db.delete(integrations).where(and(eq(integrations.userId, uid(c)), eq(integrations.kind, 'gcal'))).run();
  clearEventsCache();
  return c.json({ ok: true });
});

calendar.post('/test', async (c) => {
  const cfg = getGcalConfig(uid(c));
  if (!cfg) return c.json({ error: 'not_configured' }, 400);
  const ids = [...cfg.readCalendarIds, ...(cfg.pushCalendarId ? [cfg.pushCalendarId] : [])];
  const results = await Promise.all(
    ids.map(async (calendarId) => {
      try {
        await testCalendar(cfg, calendarId);
        return { calendarId, ok: true as const };
      } catch (e) {
        return { calendarId, ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return c.json({ results });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

calendar.get('/events', async (c) => {
  const cfg = getGcalConfig(uid(c));
  if (!cfg || cfg.readCalendarIds.length === 0) return c.json({ configured: false, events: [] });
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return c.json({ error: 'invalid_input' }, 400);
  try {
    const lists = await Promise.all(cfg.readCalendarIds.map((id) => listEvents(cfg, id, from, to)));
    return c.json({ configured: true, events: lists.flat() });
  } catch (e) {
    console.error('[gcal] events fetch failed:', e);
    return c.json({ error: 'calendar_unavailable' }, 502);
  }
});
