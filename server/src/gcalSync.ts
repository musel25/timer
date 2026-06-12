/** Best-effort mirroring of dated tasks onto a Google "Planner" calendar.
 *  All entry points are fire-and-forget: a Google failure must never block or
 *  fail a task operation — the reconcile sweep repairs drift later. */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { tasks, users } from './schema';
import { getGcalConfig } from './calendar';
import { deleteEvent, insertEvent, listAllEvents, patchEvent, type EventBody, type RawEvent } from './gcal';

export interface SyncTask {
  id: string;
  title: string;
  date: string | null;
  done: boolean;
  gcalEventId: string | null;
}

export function eventTitle(t: Pick<SyncTask, 'title' | 'done'>): string {
  return t.done ? `✓ ${t.title}` : t.title;
}

/** 'YYYY-MM-DD' + 1 day, pure string math via UTC (no timezone drift). */
export function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** All-day event body for a dated task. Google's all-day `end.date` is exclusive. */
export function taskToEventBody(t: Pick<SyncTask, 'title' | 'done' | 'date'>): EventBody {
  if (!t.date) throw new Error('taskToEventBody requires a dated task');
  return { summary: eventTitle(t), start: { date: t.date }, end: { date: nextDay(t.date) } };
}

export interface ReconcilePlan {
  inserts: SyncTask[];
  patches: { task: SyncTask; eventId: string }[];
  deletes: string[];
}

/** Pure diff between dated tasks and the Planner calendar's events. The
 *  Planner calendar is app-owned: events no task references get deleted. */
export function planReconcile(dated: SyncTask[], events: RawEvent[]): ReconcilePlan {
  const byEventId = new Map(events.map((e) => [e.id, e]));
  const inserts: SyncTask[] = [];
  const patches: { task: SyncTask; eventId: string }[] = [];
  const referenced = new Set<string>();
  for (const t of dated) {
    const ev = t.gcalEventId ? byEventId.get(t.gcalEventId) : undefined;
    if (!ev) {
      inserts.push(t);
      continue;
    }
    referenced.add(ev.id);
    if (ev.summary !== eventTitle(t) || ev.start?.date !== t.date) patches.push({ task: t, eventId: ev.id });
  }
  const deletes = events.filter((e) => !referenced.has(e.id)).map((e) => e.id);
  return { inserts, patches, deletes };
}

/* ---------- live sync entry points (called from the task API) ---------- */

/** Fire-and-forget: mirror one task's current state to the Planner calendar. */
export function queueTaskSync(userId: string, taskId: string): void {
  void syncTask(userId, taskId).catch((e) => console.error('[gcal] task sync failed:', e));
}

async function syncTask(userId: string, taskId: string): Promise<void> {
  const cfg = getGcalConfig(userId);
  if (!cfg?.pushCalendarId) return;
  const t = db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).get();
  if (!t) return; // row already deleted — queueTaskDelete handles that path
  if (!t.date) {
    // Moved back to the Inbox: remove the mirror event.
    if (t.gcalEventId) {
      await deleteEvent(cfg, cfg.pushCalendarId, t.gcalEventId);
      db.update(tasks).set({ gcalEventId: null }).where(eq(tasks.id, t.id)).run();
    }
    return;
  }
  const eventBody = taskToEventBody(t);
  if (t.gcalEventId) {
    try {
      await patchEvent(cfg, cfg.pushCalendarId, t.gcalEventId, eventBody);
      return;
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status !== 404 && status !== 410) throw e; // event vanished — fall through and recreate
    }
  }
  const eventId = await insertEvent(cfg, cfg.pushCalendarId, eventBody);
  db.update(tasks).set({ gcalEventId: eventId }).where(eq(tasks.id, t.id)).run();
}

/** Fire-and-forget removal of a deleted task's mirror event (id captured pre-delete). */
export function queueTaskDelete(userId: string, gcalEventId: string | null): void {
  if (!gcalEventId) return;
  const cfg = getGcalConfig(userId);
  if (!cfg?.pushCalendarId) return;
  void deleteEvent(cfg, cfg.pushCalendarId, gcalEventId).catch((e) => console.error('[gcal] event delete failed:', e));
}

/* ---------- reconcile sweep ---------- */

export async function reconcile(userId: string): Promise<void> {
  const cfg = getGcalConfig(userId);
  if (!cfg?.pushCalendarId) return;
  const dated = db.select().from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.date))).all() as unknown as SyncTask[];
  const events = await listAllEvents(cfg, cfg.pushCalendarId);
  const plan = planReconcile(dated, events);
  for (const t of plan.inserts) {
    const eventId = await insertEvent(cfg, cfg.pushCalendarId, taskToEventBody(t));
    db.update(tasks).set({ gcalEventId: eventId }).where(eq(tasks.id, t.id)).run();
  }
  for (const { task: t, eventId } of plan.patches) {
    await patchEvent(cfg, cfg.pushCalendarId, eventId, taskToEventBody(t));
  }
  for (const eventId of plan.deletes) {
    await deleteEvent(cfg, cfg.pushCalendarId, eventId);
  }
  if (plan.inserts.length || plan.patches.length || plan.deletes.length) {
    console.log(`[gcal] reconciled: +${plan.inserts.length} ~${plan.patches.length} -${plan.deletes.length}`);
  }
}

/** Reconcile every user's Planner calendar now, then hourly. */
export function startCalendarSync(): void {
  const run = () => {
    for (const u of db.select({ id: users.id }).from(users).all()) {
      reconcile(u.id).catch((e) => console.error('[gcal] reconcile failed:', e));
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}
