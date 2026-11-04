import { Hono } from 'hono';
import { z } from 'zod';
import { eq, getTableColumns, sql, type InferInsertModel, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from '../db';
import { habitGroups, habits, timers, sessions, tasks, notes, desktops, restDays, vacationDays, taskAttachments, userSettings } from '../schema';

import { DEFAULT_SETTINGS } from '../seed';
import { body, uid, type ApiEnv } from './shared';

export const routes = new Hono<ApiEnv>();

/* ---------- export / import ---------- */
routes.get('/export', (c) => {
  const u = uid(c);
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, u)).get();
  return c.json({
    version: 1, exportedAt: Date.now(),
    settings: settings ? settings.data : DEFAULT_SETTINGS,
    groups: db.select().from(habitGroups).where(eq(habitGroups.userId, u)).all(),
    habits: db.select().from(habits).where(eq(habits.userId, u)).all(),
    timers: db.select().from(timers).where(eq(timers.userId, u)).all(),
    sessions: db.select().from(sessions).where(eq(sessions.userId, u)).all(),
    restDays: db.select().from(restDays).where(eq(restDays.userId, u)).all(),
    vacationDays: db.select().from(vacationDays).where(eq(vacationDays.userId, u)).all(),
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

// Backups describe stored values, not the current editor rules. SQLite text
// has no enum or nonempty constraint; numbers have no positive-goal constraint.
// Drizzle metadata supplies field types, nullability and missing-field defaults.
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
const jsonValue: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.string(), z.number().finite(), z.boolean(), z.array(jsonValue), z.record(jsonValue),
]));

function storageInput<T extends SQLiteTable, K extends string = never>(
  table: T,
  omitted: K[] = [],
): z.ZodType<Omit<InferInsertModel<T>, 'userId' | K>> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (key === 'userId' || omitted.includes(key as K)) continue;
    let field: z.ZodType<unknown>;
    switch (column.dataType) {
      case 'string': field = z.string(); break;
      case 'number': field = z.number().finite(); break;
      case 'boolean': field = z.boolean(); break;
      case 'json': field = jsonValue; break;
      case 'buffer': field = z.instanceof(Buffer); break;
      default: throw new Error(`Unsupported backup column: ${key}`);
    }
    if (!column.notNull) field = field.nullable();
    if (!column.notNull || column.hasDefault) field = field.optional();
    shape[key] = field;
  }
  // The runtime shape above is derived from the same table as InferInsertModel.
  // Stored JSON remains opaque, including shapes older editors accepted.
  // SQL expression inputs are intentionally excluded from incoming JSON.
  return z.object(shape) as unknown as z.ZodType<Omit<InferInsertModel<T>, 'userId' | K>>;
}

const groupBackup = storageInput(habitGroups);
const habitBackup = storageInput(habits);
const timerBackup = storageInput(timers);
const sessionBackup = storageInput(sessions);
const taskBackup = storageInput(tasks);
const noteBackup = storageInput(notes);
const desktopBackup = storageInput(desktops);
const attachmentBackup = storageInput(taskAttachments, ['data']).and(z.object({
  dataBase64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}));
const backupInput = z.object({
  version: z.literal(1).optional(), exportedAt: z.number().optional(),
  settings: jsonValue.optional(),
  groups: z.array(groupBackup).default([]), habits: z.array(habitBackup).default([]),
  timers: z.array(timerBackup).default([]), sessions: z.array(sessionBackup).default([]),
  tasks: z.array(taskBackup).default([]), notes: z.array(noteBackup).default([]),
  desktops: z.array(desktopBackup).default([]), attachments: z.array(attachmentBackup).default([]),
  restDays: z.array(storageInput(restDays)).default([]), vacationDays: z.array(storageInput(vacationDays)).default([]),
});

// Passing JavaScript null to Drizzle means SQL NULL. Encode JSON null as text
// for required JSON columns so a stored JSON null can survive a backup.
function jsonColumn<T>(value: T): T | SQL {
  return value === null ? sql`'null'` : value;
}

routes.post('/import', async (c) => {
  const u = uid(c);
  const parsed = backupInput.safeParse(await body(c));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const data = parsed.data;
  // userId is stripped by validation. Set it from the authenticated session.
  // Conflicting IDs remain untouched, including IDs owned by another account.
  db.transaction((tx) => {
    for (const row of data.groups) tx.insert(habitGroups).values({ ...row, userId: u }).onConflictDoNothing().run();
    for (const row of data.timers) tx.insert(timers).values({ ...row, userId: u, config: jsonColumn(row.config) }).onConflictDoNothing().run();
    for (const row of data.habits) tx.insert(habits).values({ ...row, userId: u, durations: jsonColumn(row.durations) }).onConflictDoNothing().run();
    for (const row of data.sessions) tx.insert(sessions).values({ ...row, userId: u }).onConflictDoNothing().run();
    for (const row of data.tasks) tx.insert(tasks).values({ ...row, userId: u }).onConflictDoNothing().run();
    for (const stored of data.notes) {
      const row: typeof notes.$inferInsert = { ...stored, userId: u };
      tx.insert(notes).values({ ...row, tags: jsonColumn(row.tags) }).onConflictDoNothing().run();
    }
    for (const stored of data.desktops) {
      const row: typeof desktops.$inferInsert = { ...stored, userId: u };
      tx.insert(desktops).values({ ...row, tasks: jsonColumn(row.tasks), comments: jsonColumn(row.comments) }).onConflictDoNothing().run();
    }
    for (const row of data.restDays) tx.insert(restDays).values({ ...row, userId: u }).onConflictDoNothing().run();
    for (const row of data.vacationDays) tx.insert(vacationDays).values({ ...row, userId: u }).onConflictDoNothing().run();
    for (const row of data.attachments) {
      const { dataBase64, ...metadata } = row;
      tx.insert(taskAttachments).values({ ...metadata, userId: u, data: Buffer.from(dataBase64, 'base64') }).onConflictDoNothing().run();
    }
    if (data.settings !== undefined) {
      const settings = data.settings === null ? sql`'null'` : data.settings;
      tx.insert(userSettings).values({ userId: u, data: settings })
        .onConflictDoUpdate({ target: userSettings.userId, set: { data: settings } }).run();
    }
  });
  return c.json({ ok: true });
});
