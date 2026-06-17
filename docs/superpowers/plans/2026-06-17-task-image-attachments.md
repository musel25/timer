# Task Image Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste an image into a task's description; pasted images are stored as attachments on the task and shown as thumbnails in the task editor.

**Architecture:** Images are stored as binary blobs in a new `task_attachments` SQLite table (DB stays the single source of truth, so existing DB-based backup/export keeps working). New Hono routes upload/list/serve/delete attachments, all scoped to the authenticated user. The client downscales pasted images client-side via canvas before upload and renders thumbnails below the notes box in `TaskEditor`.

**Tech Stack:** Node + Hono + better-sqlite3 + Drizzle (server); React + @tanstack/react-query + Vite + Tailwind (client); Vitest for tests.

## Global Constraints

- Attachment model only — `notes` stays a plain `<textarea>`; images are separate records, NOT inline in the notes text.
- Storage is SQLite blobs only — no filesystem writes, no new runtime dependencies (no `sharp`/`multer`).
- Allowed mime types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
- Server size cap on stored bytes: `3 * 1024 * 1024` (3 MB). Reject larger with HTTP 400.
- Client downscale cap: longest edge ≤ `1600` px.
- All attachment routes require auth and are scoped to `uid(c)`; a user must never read/delete another user's attachment (return 404).
- `TaskEditor` always receives a persisted task with a real `task.id`, so uploads always have a valid task id (no unsaved-task handling needed).
- Follow existing patterns: `newId()` for ids, `Date.now()` epoch-ms timestamps, drizzle query style, `c.json({ error: '...' }, code)` error shape.

---

### Task 1: `task_attachments` schema + migration

**Files:**
- Modify: `server/src/schema.ts` (add table + import `blob`)
- Modify: `server/src/db.ts:117-123` (add `CREATE TABLE` block inside `migrate()`'s `sqlite.exec`)
- Test: `server/src/attachments.test.ts` (create)

**Interfaces:**
- Produces: drizzle table `taskAttachments` with columns `{ id: text PK, userId: text, taskId: text, mime: text, data: blob<Buffer>, width: int|null, height: int|null, createdAt: int }`; SQL table `task_attachments` with the same columns plus indexes `idx_task_attachments_task(task_id)` and `idx_task_attachments_user(user_id)`.

- [ ] **Step 1: Write the failing test**

Create `server/src/attachments.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

// Point the DB at a throwaway file BEFORE importing db.ts (reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-attach-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('task_attachments migration + blob round-trip', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let taskAttachments: typeof import('./schema').taskAttachments;

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ taskAttachments } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates task_attachments with the expected columns', () => {
    const cols = (sqlite.prepare('PRAGMA table_info(task_attachments)').all() as { name: string }[]).map((c) => c.name);
    for (const col of ['id', 'user_id', 'task_id', 'mime', 'data', 'width', 'height', 'created_at']) {
      expect(cols).toContain(col);
    }
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('round-trips a binary blob', () => {
    const now = Date.now();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff]);
    db.insert(taskAttachments).values({
      id: 'a1', userId: 'u1', taskId: 't1', mime: 'image/png', data: bytes, width: 1, height: 1, createdAt: now,
    }).run();
    const got = db.select().from(taskAttachments).where(eq(taskAttachments.id, 'a1')).get();
    expect(got?.mime).toBe('image/png');
    expect(Buffer.from(got!.data as Buffer).equals(bytes)).toBe(true);
    expect(got?.width).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: FAIL — `taskAttachments` is not exported from `./schema` / table does not exist.

- [ ] **Step 3: Add the drizzle table to `schema.ts`**

In `server/src/schema.ts`, change the import line to add `blob`:

```typescript
import { sqliteTable, text, integer, primaryKey, blob } from 'drizzle-orm/sqlite-core';
```

Append at the end of the file:

```typescript
export const taskAttachments = sqliteTable('task_attachments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  taskId: text('task_id').notNull(),
  mime: text('mime').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: integer('created_at').notNull(),
});
```

- [ ] **Step 4: Add the SQL table to `db.ts`**

In `server/src/db.ts`, inside the `sqlite.exec(\`...\`)` template in `migrate()`, add this block immediately after the `integrations` table (before the closing backtick at line ~122):

```sql
    CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_attachments_user ON task_attachments(user_id);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/schema.ts server/src/db.ts server/src/attachments.test.ts
git commit -m "feat(tasks): add task_attachments table + migration"
```

---

### Task 2: Attachment API routes (upload, list, serve, delete)

**Files:**
- Modify: `server/src/api.ts` (top guard block ~line 70; add routes after the tasks section ~line 298)
- Test: `server/src/attachments.test.ts` (add a new `describe` block)

**Interfaces:**
- Consumes: `taskAttachments` table (Task 1); existing `tasks` table; `uid`, `body`, `newId`, `requireAuth`.
- Produces these routes (all require auth, scoped to `uid(c)`):
  - `POST /tasks/:id/attachments` — body `{ dataUrl: string, width?: number, height?: number }`. Returns `201` with metadata `{ id, taskId, mime, width, height, createdAt }`. `404` if task not owned; `400` `invalid_input` / `invalid_image` / `too_large`.
  - `GET /tasks/:id/attachments` — returns `TaskAttachment[]` metadata (no `data` bytes), oldest first.
  - `GET /attachments/:id` — returns raw image bytes with `Content-Type`; `404` if not owned.
  - `DELETE /attachments/:id` — `{ ok: true }`; `404` if not owned.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/attachments.test.ts` (after the existing `describe`). This block boots the real `api` router and authenticates by inserting an `auth_sessions` row and sending its id as the `sid` cookie:

```typescript
// 1x1 transparent PNG.
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('attachment HTTP routes', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let api: typeof import('./api').api;
  let users: typeof import('./schema').users;
  let authSessions: typeof import('./schema').authSessions;
  let tasks: typeof import('./schema').tasks;

  // Insert a user + a future-dated session; return a Cookie header for it.
  function makeUser(id: string): string {
    const now = Date.now();
    db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', createdAt: now }).run();
    const sid = `sid_${id}`;
    db.insert(authSessions).values({ id: sid, userId: id, createdAt: now, expiresAt: now + 1e9, userAgent: null }).run();
    return `sid=${sid}`;
  }
  const json = (cookie: string, body: unknown) =>
    ({ headers: { 'content-type': 'application/json', cookie }, method: 'POST', body: JSON.stringify(body) });

  beforeAll(async () => {
    ({ sqlite, db } = await import('./db'));
    ({ api } = await import('./api'));
    ({ users, authSessions, tasks } = await import('./schema'));
    (await import('./db')).migrate();
  });

  afterAll(() => { /* shared dir cleaned by the first describe's afterAll */ });

  it('uploads an image and returns metadata without bytes', async () => {
    const cookie = makeUser('alice');
    db.insert(tasks).values({ id: 'task-a', userId: 'alice', title: 'A', sortOrder: 1, createdAt: Date.now() }).run();
    const res = await api.request('/tasks/task-a/attachments', json(cookie, { dataUrl: PNG_1x1, width: 1, height: 1 }));
    expect(res.status).toBe(201);
    const meta = await res.json();
    expect(meta.taskId).toBe('task-a');
    expect(meta.mime).toBe('image/png');
    expect(meta.id).toBeTruthy();
    expect(meta.data).toBeUndefined();
  });

  it('rejects a disallowed mime', async () => {
    const cookie = makeUser('bob');
    db.insert(tasks).values({ id: 'task-b', userId: 'bob', title: 'B', sortOrder: 1, createdAt: Date.now() }).run();
    const bad = 'data:application/pdf;base64,JVBERi0=';
    const res = await api.request('/tasks/task-b/attachments', json(cookie, { dataUrl: bad }));
    expect(res.status).toBe(400);
  });

  it('rejects an oversize image', async () => {
    const cookie = makeUser('carol');
    db.insert(tasks).values({ id: 'task-c', userId: 'carol', title: 'C', sortOrder: 1, createdAt: Date.now() }).run();
    const bigB64 = Buffer.alloc(3 * 1024 * 1024 + 10, 0).toString('base64');
    const res = await api.request('/tasks/task-c/attachments', json(cookie, { dataUrl: `data:image/png;base64,${bigB64}` }));
    expect(res.status).toBe(400);
  });

  it('serves bytes with the right content-type and lists metadata', async () => {
    const cookie = makeUser('dave');
    db.insert(tasks).values({ id: 'task-d', userId: 'dave', title: 'D', sortOrder: 1, createdAt: Date.now() }).run();
    const up = await (await api.request('/tasks/task-d/attachments', json(cookie, { dataUrl: PNG_1x1 }))).json();

    const list = await (await api.request('/tasks/task-d/attachments', { headers: { cookie } })).json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(up.id);

    const img = await api.request(`/attachments/${up.id}`, { headers: { cookie } });
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('forbids cross-user read and delete (404)', async () => {
    const owner = makeUser('eve');
    const other = makeUser('mallory');
    db.insert(tasks).values({ id: 'task-e', userId: 'eve', title: 'E', sortOrder: 1, createdAt: Date.now() }).run();
    const up = await (await api.request('/tasks/task-e/attachments', json(owner, { dataUrl: PNG_1x1 }))).json();

    expect((await api.request(`/attachments/${up.id}`, { headers: { cookie: other } })).status).toBe(404);
    expect((await api.request(`/attachments/${up.id}`, { method: 'DELETE', headers: { cookie: other } })).status).toBe(404);
    // owner can delete
    expect((await api.request(`/attachments/${up.id}`, { method: 'DELETE', headers: { cookie: owner } })).status).toBe(200);
    expect((await api.request(`/attachments/${up.id}`, { headers: { cookie: owner } })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: FAIL — routes return 404 (not yet defined).

- [ ] **Step 3: Add the auth guard for `/attachments`**

In `server/src/api.ts`, in the guard block (after line 70 `api.use('/tasks', ...)`), add:

```typescript
api.use('/attachments', requireAuth); api.use('/attachments/*', requireAuth);
```

- [ ] **Step 4: Add `taskAttachments` to the schema import**

In `server/src/api.ts` line 5, add `taskAttachments` to the import:

```typescript
import { habitGroups, habits, sessions, taskAttachments, tasks, timers, userSettings, users } from './schema';
```

- [ ] **Step 5: Add the attachment routes**

In `server/src/api.ts`, immediately after the tasks section (after the `DELETE /tasks/:id` handler, ~line 298), add:

```typescript
/* ---------- task attachments (pasted images) ---------- */
const ATTACH_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;
const MAX_ATTACH_BYTES = 3 * 1024 * 1024;
const attachInput = z.object({
  dataUrl: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

api.post('/tasks/:id/attachments', async (c) => {
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

api.get('/tasks/:id/attachments', (c) => {
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

api.get('/attachments/:id', (c) => {
  const id = c.req.param('id');
  const u = uid(c);
  const row = db.select().from(taskAttachments)
    .where(and(eq(taskAttachments.id, id), eq(taskAttachments.userId, u))).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return new Response(new Uint8Array(row.data as Buffer), {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
});

api.delete('/attachments/:id', (c) => {
  const id = c.req.param('id');
  const u = uid(c);
  const res = db.delete(taskAttachments)
    .where(and(eq(taskAttachments.id, id), eq(taskAttachments.userId, u))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: PASS (all blocks).

- [ ] **Step 7: Commit**

```bash
git add server/src/api.ts server/src/attachments.test.ts
git commit -m "feat(tasks): upload/list/serve/delete image attachment routes"
```

---

### Task 3: Cascade delete + attachmentCount on `/tasks`

**Files:**
- Modify: `server/src/api.ts` (`GET /tasks` ~line 257; `DELETE /tasks/:id` ~line 292; add `sql` import)
- Test: `server/src/attachments.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: routes from Task 2; `taskAttachments` table.
- Produces: `GET /tasks` rows each gain `attachmentCount: number`. `DELETE /tasks/:id` also deletes that task's attachments (same user scope).

- [ ] **Step 1: Write the failing tests**

Append to `server/src/attachments.test.ts`:

```typescript
describe('task list count + cascade delete', () => {
  let db: typeof import('./db').db;
  let api: typeof import('./api').api;
  let users: typeof import('./schema').users;
  let authSessions: typeof import('./schema').authSessions;
  let tasks: typeof import('./schema').tasks;

  function makeUser(id: string): string {
    const now = Date.now();
    db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', createdAt: now }).run();
    db.insert(authSessions).values({ id: `sid_${id}`, userId: id, createdAt: now, expiresAt: now + 1e9, userAgent: null }).run();
    return `sid=sid_${id}`;
  }
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const post = (cookie: string, b: unknown) =>
    ({ headers: { 'content-type': 'application/json', cookie }, method: 'POST', body: JSON.stringify(b) });

  beforeAll(async () => {
    ({ db } = await import('./db'));
    ({ api } = await import('./api'));
    ({ users, authSessions, tasks } = await import('./schema'));
  });

  it('GET /tasks includes attachmentCount and DELETE cascades', async () => {
    const cookie = makeUser('frank');
    db.insert(tasks).values({ id: 'task-f', userId: 'frank', title: 'F', sortOrder: 1, createdAt: Date.now() }).run();
    const a1 = await (await api.request('/tasks/task-f/attachments', post(cookie, { dataUrl: PNG }))).json();
    await api.request('/tasks/task-f/attachments', post(cookie, { dataUrl: PNG }));

    const list = await (await api.request('/tasks', { headers: { cookie } })).json();
    const row = list.find((t: any) => t.id === 'task-f');
    expect(row.attachmentCount).toBe(2);

    expect((await api.request('/tasks/task-f', { method: 'DELETE', headers: { cookie } })).status).toBe(200);
    expect((await api.request(`/attachments/${a1.id}`, { headers: { cookie } })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: FAIL — `attachmentCount` is `undefined`, and the attachment survives task delete (200 instead of 404).

- [ ] **Step 3: Add the `sql` import**

In `server/src/api.ts` line 3, add `sql`:

```typescript
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
```

- [ ] **Step 4: Add `attachmentCount` to `GET /tasks`**

Replace the existing `GET /tasks` handler (lines 257-261) with:

```typescript
api.get('/tasks', (c) => {
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
```

- [ ] **Step 5: Add the cascade to `DELETE /tasks/:id`**

Replace the existing `DELETE /tasks/:id` handler (lines 292-298) with:

```typescript
api.delete('/tasks/:id', (c) => {
  const id = c.req.param('id');
  const u = uid(c);
  const row = db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, u))).get();
  db.delete(taskAttachments).where(and(eq(taskAttachments.taskId, id), eq(taskAttachments.userId, u))).run();
  db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, u))).run();
  queueTaskDelete(u, row?.gcalEventId ?? null);
  return c.json({ ok: true });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/api.ts server/src/attachments.test.ts
git commit -m "feat(tasks): attachmentCount on list + cascade-delete attachments"
```

---

### Task 4: Include attachments in export/import

**Files:**
- Modify: `server/src/api.ts` (`GET /export` ~line 319; `POST /import` ~line 332)
- Test: `server/src/attachments.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `taskAttachments` table; routes from Task 2.
- Produces: `/export` JSON gains `attachments: Array<{ id, taskId, mime, width, height, createdAt, dataBase64 }>`. `/import` restores them (decodes `dataBase64` to a Buffer, reassigns `userId`).

- [ ] **Step 1: Write the failing test**

Append to `server/src/attachments.test.ts`:

```typescript
describe('export / import attachments', () => {
  let db: typeof import('./db').db;
  let api: typeof import('./api').api;
  let users: typeof import('./schema').users;
  let authSessions: typeof import('./schema').authSessions;
  let tasks: typeof import('./schema').tasks;

  function makeUser(id: string): string {
    const now = Date.now();
    db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', createdAt: now }).run();
    db.insert(authSessions).values({ id: `sid_${id}`, userId: id, createdAt: now, expiresAt: now + 1e9, userAgent: null }).run();
    return `sid=sid_${id}`;
  }
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const post = (cookie: string, b: unknown) =>
    ({ headers: { 'content-type': 'application/json', cookie }, method: 'POST', body: JSON.stringify(b) });

  beforeAll(async () => {
    ({ db } = await import('./db'));
    ({ api } = await import('./api'));
    ({ users, authSessions, tasks } = await import('./schema'));
  });

  it('export includes attachments, import restores the blob', async () => {
    const src = makeUser('gina');
    db.insert(tasks).values({ id: 'task-g', userId: 'gina', title: 'G', sortOrder: 1, createdAt: Date.now() }).run();
    await api.request('/tasks/task-g/attachments', post(src, { dataUrl: PNG, width: 1, height: 1 }));

    const dump = await (await api.request('/export', { headers: { cookie: src } })).json();
    expect(dump.attachments).toHaveLength(1);
    expect(dump.attachments[0].dataBase64).toBeTruthy();
    expect(dump.attachments[0].mime).toBe('image/png');

    const dst = makeUser('harry');
    const importBody = { tasks: dump.tasks, attachments: dump.attachments };
    expect((await api.request('/import', post(dst, importBody))).status).toBe(200);

    const list = await (await api.request('/tasks/task-g/attachments', { headers: { cookie: dst } })).json();
    expect(list).toHaveLength(1);
    const img = await api.request(`/attachments/${list[0].id}`, { headers: { cookie: dst } });
    expect(img.status).toBe(200);
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: FAIL — `dump.attachments` is `undefined`.

- [ ] **Step 3: Add attachments to `GET /export`**

In `server/src/api.ts`, inside the `GET /export` returned object (after the `tasks:` line, ~line 328), add:

```typescript
    attachments: db.select().from(taskAttachments).where(eq(taskAttachments.userId, u)).all()
      .map((a) => ({
        id: a.id, taskId: a.taskId, mime: a.mime, width: a.width, height: a.height,
        createdAt: a.createdAt, dataBase64: Buffer.from(a.data as Buffer).toString('base64'),
      })),
```

- [ ] **Step 4: Add attachments to `POST /import`**

In `server/src/api.ts`, inside the `db.transaction((tx) => { ... })` in `POST /import`, after the `tasks` import line (~line 341), add a dedicated branch (it does NOT use the generic `reassign` because the blob needs decoding):

```typescript
    if (Array.isArray(data.attachments)) for (const a of data.attachments) {
      tx.insert(taskAttachments).values({
        id: a.id, userId: u, taskId: a.taskId, mime: a.mime,
        width: a.width ?? null, height: a.height ?? null, createdAt: a.createdAt,
        data: Buffer.from(a.dataBase64 ?? '', 'base64'),
      }).onConflictDoNothing().run();
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/attachments.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full server suite to check nothing regressed**

Run: `cd server && npm test`
Expected: PASS (all files).

- [ ] **Step 7: Commit**

```bash
git add server/src/api.ts server/src/attachments.test.ts
git commit -m "feat(tasks): include image attachments in export/import"
```

---

### Task 5: Client types + image-resize util

**Files:**
- Modify: `client/src/lib/types.ts` (add `TaskAttachment`, add `attachmentCount?` to `Task`)
- Create: `client/src/lib/imageResize.ts`
- Test: `client/src/lib/imageResize.test.ts` (create — tests the pure dimension math only)

**Interfaces:**
- Produces:
  - `interface TaskAttachment { id: string; taskId: string; mime: string; width: number | null; height: number | null; createdAt: number; }`
  - `Task` gains `attachmentCount?: number`.
  - `scaledDimensions(w: number, h: number, maxEdge: number): { width: number; height: number }` — pure; never upscales; preserves aspect ratio; rounds to integers.
  - `async function resizeImageToDataUrl(file: Blob, maxEdge?: number): Promise<{ dataUrl: string; width: number; height: number }>` — canvas-based; default `maxEdge = 1600`. GIFs are returned as-is (no canvas, to preserve animation).

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/imageResize.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { scaledDimensions } from './imageResize';

describe('scaledDimensions', () => {
  it('does not upscale images smaller than the cap', () => {
    expect(scaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales a wide image down to the cap on its longest edge', () => {
    expect(scaledDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it('scales a tall image down to the cap on its longest edge', () => {
    expect(scaledDimensions(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it('rounds to integer pixels', () => {
    const d = scaledDimensions(1000, 333, 500);
    expect(Number.isInteger(d.width)).toBe(true);
    expect(Number.isInteger(d.height)).toBe(true);
    expect(d.width).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/imageResize.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Create `imageResize.ts`**

Create `client/src/lib/imageResize.ts`:

```typescript
/** Compute target dimensions so the longest edge is at most maxEdge.
 *  Never upscales. Preserves aspect ratio. Returns integer pixels. */
export function scaledDimensions(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/** Output mime to re-encode to. Canvas can't keep animated GIFs, so callers
 *  handle GIF separately; for the rest we keep png/webp/jpeg and fall back to png. */
function outputMime(input: string): string {
  if (input === 'image/jpeg' || input === 'image/webp') return input;
  return 'image/png';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

/** Downscale a pasted image to a data URL whose longest edge is <= maxEdge.
 *  GIFs are passed through unchanged to keep animation. */
export async function resizeImageToDataUrl(
  file: Blob,
  maxEdge = 1600,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif') {
    const img = await loadImage(original);
    return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight };
  }
  const img = await loadImage(original);
  const dims = scaledDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight };
  ctx.drawImage(img, 0, 0, dims.width, dims.height);
  const mime = outputMime(file.type);
  const dataUrl = mime === 'image/jpeg' ? canvas.toDataURL(mime, 0.9) : canvas.toDataURL(mime);
  return { dataUrl, width: dims.width, height: dims.height };
}
```

- [ ] **Step 4: Add the types**

In `client/src/lib/types.ts`, add `attachmentCount?: number;` to the `Task` interface (after `sortOrder`), and append a new interface:

```typescript
export interface TaskAttachment {
  id: string;
  taskId: string;
  mime: string;
  width: number | null;
  height: number | null;
  createdAt: number;
}
```

- [ ] **Step 5: Run test + typecheck to verify pass**

Run: `cd client && npx vitest run src/lib/imageResize.test.ts && npm run typecheck`
Expected: PASS (4 tests) and no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/imageResize.ts client/src/lib/imageResize.test.ts
git commit -m "feat(tasks): client attachment types + image-resize util"
```

---

### Task 6: Attachment query hooks

**Files:**
- Modify: `client/src/lib/hooks.ts` (add after the tasks hooks, ~line 123)

**Interfaces:**
- Consumes: `api` client; `TaskAttachment` type (Task 5).
- Produces:
  - `useTaskAttachments(taskId: string)` → query of `TaskAttachment[]`, key `['task-attachments', taskId]`.
  - `useUploadAttachment()` → mutation `({ taskId, dataUrl, width, height }) => TaskAttachment`; invalidates `['task-attachments', taskId]` and `['tasks']`.
  - `useDeleteAttachment()` → mutation `({ id, taskId }) => void`; invalidates `['task-attachments', taskId]` and `['tasks']`.

- [ ] **Step 1: Add the import**

In `client/src/lib/hooks.ts` line 4, add `TaskAttachment`:

```typescript
import type { CalendarEvent, Habit, HabitGroup, Session, Settings, Task, TaskAttachment, TimerPreset } from './types';
```

- [ ] **Step 2: Add the hooks**

In `client/src/lib/hooks.ts`, after `useDeleteTask` (~line 123), add:

```typescript
/* ---- task attachments (pasted images) ---- */
export const useTaskAttachments = (taskId: string) =>
  useQuery({
    queryKey: ['task-attachments', taskId],
    queryFn: () => api.get<TaskAttachment[]>(`/tasks/${taskId}/attachments`),
  });

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; dataUrl: string; width: number; height: number }) =>
      api.post<TaskAttachment>(`/tasks/${v.taskId}/attachments`, { dataUrl: v.dataUrl, width: v.width, height: v.height }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['task-attachments', v.taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; taskId: string }) => api.del(`/attachments/${v.id}`),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['task-attachments', v.taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/hooks.ts
git commit -m "feat(tasks): react-query hooks for task attachments"
```

---

### Task 7: Paste + thumbnails in TaskEditor; 📎 indicator on TaskRow

**Files:**
- Modify: `client/src/features/tasks/TaskEditor.tsx`
- Modify: `client/src/features/tasks/TaskRow.tsx`

**Interfaces:**
- Consumes: `useTaskAttachments`, `useUploadAttachment`, `useDeleteAttachment` (Task 6); `resizeImageToDataUrl` (Task 5); `Task.attachmentCount` (Task 5).
- Produces: paste-to-upload + thumbnail grid with remove + open-full-size in `TaskEditor`; a 📎 + count indicator on `TaskRow`.

- [ ] **Step 1: Update `TaskEditor.tsx`**

Replace the whole file `client/src/features/tasks/TaskEditor.tsx` with:

```tsx
import { useState } from 'react';
import { X } from 'lucide-react';
import type { Task } from '../../lib/types';
import { useSaveTask, useDeleteTask, useTaskAttachments, useUploadAttachment, useDeleteAttachment } from '../../lib/hooks';
import { resizeImageToDataUrl } from '../../lib/imageResize';

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState(task.date ?? '');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const save = useSaveTask();
  const del = useDeleteTask();

  const { data: attachments } = useTaskAttachments(task.id);
  const upload = useUploadAttachment();
  const removeAttachment = useDeleteAttachment();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await save.mutateAsync({ id: task.id, title: title.trim(), notes: notes.trim() || null, date: date || null });
      onClose();
    } catch {
      // keep modal open on error
    }
  }

  async function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((it) => it.type.startsWith('image/'));
    if (!imageItem) return; // let normal text paste proceed
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setPasteError(null);
    try {
      const { dataUrl, width, height } = await resizeImageToDataUrl(file);
      await upload.mutateAsync({ taskId: task.id, dataUrl, width, height });
    } catch {
      setPasteError('Could not attach that image.');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card w-full max-w-md space-y-3 rounded-b-none rounded-t-2xl p-4 sm:rounded-2xl"
      >
        <input className="input text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
        <textarea
          className="input min-h-[72px] resize-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onPaste={onPaste}
          placeholder="Notes (optional) — paste an image to attach it"
        />

        {upload.isPending && <p className="text-xs text-slate-400">Attaching image…</p>}
        {pasteError && <p className="text-xs text-rose-400">{pasteError}</p>}

        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="group relative">
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/attachments/${a.id}`}
                    alt="attachment"
                    className="h-20 w-20 rounded-lg object-cover ring-1 ring-ink-600"
                  />
                </a>
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => removeAttachment.mutate({ id: a.id, taskId: task.id })}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-800 p-0.5 text-slate-200 ring-1 ring-ink-600 transition hover:text-rose-400"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="label">Date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-center justify-between pt-1">
          <button type="button" className="btn-outline text-rose-500" onClick={async () => { if (!confirm('Delete this task?')) return; try { await del.mutateAsync(task.id); onClose(); } catch { /* keep open */ } }}>Delete</button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent">Save</button>
          </div>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add the 📎 indicator to `TaskRow.tsx`**

In `client/src/features/tasks/TaskRow.tsx`, import `Paperclip` and render a count when `task.attachmentCount` is set. Change the import on line 1:

```tsx
import { EyeOff, Check, Paperclip } from 'lucide-react';
```

Then replace the title button block (lines 18-23) with the title button followed by the indicator:

```tsx
      <button
        onClick={() => onEdit?.(task)}
        className={`min-w-0 flex-1 break-words text-left text-sm ${task.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
      >
        {task.title}
      </button>
      {!!task.attachmentCount && (
        <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-slate-500" title={`${task.attachmentCount} image${task.attachmentCount > 1 ? 's' : ''}`}>
          <Paperclip size={13} />
          {task.attachmentCount}
        </span>
      )}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd client && npm run typecheck && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/tasks/TaskEditor.tsx client/src/features/tasks/TaskRow.tsx
git commit -m "feat(tasks): paste images in the task editor + paperclip indicator"
```

---

### Task 8: Full verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm test`
Expected: all tests PASS.

- [ ] **Step 2: Run the full client test suite + typecheck + build**

Run: `cd client && npm test && npm run typecheck && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 3: Manual smoke test (local prod build — `vite dev` is broken on `tracking-tightest`)**

Per the project's known dev gotcha, test against the Node server serving the built client:

```bash
cd client && npm run build
cd ../server && TIMER_DB=/tmp/attach-smoke.db ADMIN_EMAIL=test@test.com ADMIN_PASSWORD=test1234 CLIENT_DIR=../client/dist npx tsx src/index.ts
```

Then in a browser at the server's port (default 8080):
1. Log in as `test@test.com` / `test1234`.
2. Create a task via QuickAdd, click it to open the editor.
3. Copy any image to the clipboard and paste into the notes box → a thumbnail appears.
4. Reload the page, reopen the task → the thumbnail is still there (persisted).
5. Verify the 📎 count shows on the task row in the list.
6. Click the thumbnail → opens full-size in a new tab.
7. Click ✕ on the thumbnail → it disappears; the 📎 count updates.
8. Delete the task → confirm no orphaned attachment (reopening would 404; visually it's gone).

- [ ] **Step 4: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "test(tasks): verify image attachment flow end-to-end"
```

(Skip this commit if there were no changes.)

---

## Self-Review

**Spec coverage:**
- Attachment model, notes stays textarea → Task 7. ✓
- `task_attachments` table (blob, columns, cascade) → Tasks 1, 3. ✓
- Client paste + downscale via canvas, thumbnails, remove, open full-size, multiple images → Tasks 5, 7. ✓
- API: POST/GET list/GET serve/DELETE, mime allowlist, 3MB cap, auth scoping → Task 2. ✓
- Cascade on task delete → Task 3. ✓
- 📎 indicator with count on TaskRow + attachmentCount on `/tasks` → Tasks 3, 7. ✓
- Export/import includes attachments → Task 4. ✓
- Testing: upload happy path, size/mime rejection, auth scoping, list metadata, cascade, export/import → Tasks 2, 3, 4. ✓
- Out of scope items (inline images, drag-drop, non-image files, server-side processing) → not implemented. ✓

**Placeholder scan:** No TODO/TBD/"add error handling" placeholders; every code step shows complete code.

**Type consistency:** `taskAttachments` columns match between `schema.ts`, `db.ts`, and route usage. `TaskAttachment` shape (no `data` field) matches the metadata returned by `GET /tasks/:id/attachments` and `POST`. Hook mutation arg shapes (`{ taskId, dataUrl, width, height }`, `{ id, taskId }`) match their call sites in `TaskEditor`. `resizeImageToDataUrl` / `scaledDimensions` names consistent across util, test, and editor.
