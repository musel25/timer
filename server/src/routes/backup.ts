import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { habitGroups, habits, timers, sessions, tasks, notes, desktops, taskAttachments, userSettings } from '../schema';
import { DEFAULT_SETTINGS } from '../seed';
import { body, uid, type ApiEnv } from './shared';
export const routes = new Hono<ApiEnv>();

/* ---------- export / import ---------- */
routes.get('/export', (c) => {
  const u = uid(c);
  return c.json({
    version: 1, exportedAt: Date.now(),
    settings: db.select().from(userSettings).where(eq(userSettings.userId, u)).get()?.data ?? DEFAULT_SETTINGS,
    groups: db.select().from(habitGroups).where(eq(habitGroups.userId, u)).all(),
    habits: db.select().from(habits).where(eq(habits.userId, u)).all(),
    timers: db.select().from(timers).where(eq(timers.userId, u)).all(),
    sessions: db.select().from(sessions).where(eq(sessions.userId, u)).all(),
    tasks: db.select().from(tasks).where(eq(tasks.userId, u)).all(),
    notes: db.select().from(notes).where(eq(notes.userId, u)).all(),
    desktops: db.select().from(desktops).where(eq(desktops.userId, u)).all(),
    attachments: db.select().from(taskAttachments).where(eq(taskAttachments.userId, u)).all()
      .map((a) => ({
        id: a.id, taskId: a.taskId, mime: a.mime, width: a.width, height: a.height,
        createdAt: a.createdAt, dataBase64: Buffer.from(a.data as Buffer).toString('base64'),
      })),
  });
});

routes.post('/import', async (c) => {
  const u = uid(c);
  const data = (await body(c)) as any;
  const reassign = (rows: any[] = []) => rows.map((r) => ({ ...r, userId: u }));
  db.transaction((tx) => {
    if (Array.isArray(data.groups)) for (const g of reassign(data.groups)) tx.insert(habitGroups).values(g).onConflictDoNothing().run();
    if (Array.isArray(data.timers)) for (const t of reassign(data.timers)) tx.insert(timers).values(t).onConflictDoNothing().run();
    if (Array.isArray(data.habits)) for (const h of reassign(data.habits)) tx.insert(habits).values(h).onConflictDoNothing().run();
    if (Array.isArray(data.sessions)) for (const s of reassign(data.sessions)) tx.insert(sessions).values(s).onConflictDoNothing().run();
    if (Array.isArray(data.tasks)) for (const t of reassign(data.tasks)) tx.insert(tasks).values(t).onConflictDoNothing().run();
    if (Array.isArray(data.notes)) for (const n of reassign(data.notes)) tx.insert(notes).values(n).onConflictDoNothing().run();
    if (Array.isArray(data.desktops)) for (const d of reassign(data.desktops)) tx.insert(desktops).values(d).onConflictDoNothing().run();
    if (Array.isArray(data.attachments)) for (const a of data.attachments) {
      tx.insert(taskAttachments).values({
        id: a.id, userId: u, taskId: a.taskId, mime: a.mime,
        width: a.width ?? null, height: a.height ?? null, createdAt: a.createdAt,
        data: Buffer.from(a.dataBase64 ?? '', 'base64'),
      }).onConflictDoNothing().run();
    }
    if (data.settings) tx.insert(userSettings).values({ userId: u, data: data.settings })
      .onConflictDoUpdate({ target: userSettings.userId, set: { data: data.settings } }).run();
  });
  return c.json({ ok: true });
});
