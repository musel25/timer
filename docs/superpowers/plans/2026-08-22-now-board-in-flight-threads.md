# Now Board — In-Flight Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a "Now" board that holds at most three in-flight threads of work, remembers where you left each one, and pokes you when a parked thread is ready.

**Architecture:** A new `threads` table mirrors the existing `notes` slice end to end (db.ts → schema.ts → api.ts → hooks.ts). Pure decision logic (`nextUp.ts`, `notify.ts`) lives in testable modules with no React. A `NowProvider` — modelled on the existing `AgentsContext` — holds the list, a clock tick, and the notifier, and is consumed both by the `/now` page and by ambient surfaces in `Layout` (nav badge, strip, document title).

**Tech Stack:** Hono + zod + Drizzle/better-sqlite3 on the server; React + TanStack Query + Tailwind + React Router on the client; vitest both sides.

**Spec:** `docs/superpowers/specs/2026-08-22-now-board-in-flight-threads-design.md`

## Global Constraints

- **Node 22.** The Dockerfile is pinned to `node:22-bookworm-slim` and better-sqlite3 ^11 crashes on Node 24. Do not bump either.
- **Auth is opt-in per route prefix** (`server/src/api.ts`). A new prefix is **public** until `api.use('/threads', requireAuth); api.use('/threads/*', requireAuth);` is registered. This is a security requirement, not a nicety.
- **Schema changes go in three places**: raw `CREATE TABLE` in `server/src/db.ts`, the drizzle table in `server/src/schema.ts`, and the TypeScript interface in `client/src/lib/types.ts`. A brand-new table needs no `addColumnIfMissing`; new *columns on existing tables* do.
- **The service worker caches `/api` NetworkFirst.** Any field added in this change may be absent from a cached response. Always read through a default (`settings.wipLimit ?? 3`), never assume presence.
- **Lockfiles are committed and the image builds with `npm ci`.** This plan adds no new dependencies. If that changes, install locally with `npm install <pkg>` and commit both files.
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Push after every commit. Never write a Claude co-author trailer.
- **Tests:** `npx vitest run` from inside `server/` and from inside `client/` separately.
- **Deploy:** the change is not done until `./deploy.sh` has run and prod serves the new commit.

---

## File Structure

**Server (create):**
- `server/src/threads.test.ts` — table shape, CRUD scoping, single-active invariant, export/import round-trip.

**Server (modify):**
- `server/src/db.ts` — `CREATE TABLE IF NOT EXISTS threads` + index.
- `server/src/schema.ts` — drizzle `threads` table.
- `server/src/api.ts` — auth prefix registration, CRUD routes, export/import entries.
- `server/src/seed.ts` — `wipLimit` and `nowNudges` in `DEFAULT_SETTINGS`.

**Client (create):**
- `client/src/features/now/nextUp.ts` (+ `.test.ts`) — pure selection logic. No React, no dates from `Date.now()` inside; `now` is always a parameter.
- `client/src/features/now/notify.ts` (+ `.test.ts`) — pure due-detection plus thin browser side effects.
- `client/src/features/now/NowContext.tsx` — provider: query + tick + notifier + document title. Exports `useNowOptional()`.
- `client/src/features/now/NowBoard.tsx` — the `/now` page.
- `client/src/features/now/ThreadCard.tsx` — the big active / next-up card.
- `client/src/features/now/ThreadRow.tsx` — a compact waiting/parked row.
- `client/src/features/now/AddThread.tsx` — one-input capture, cap-aware.
- `client/src/features/now/NowStrip.tsx` — the ambient bar.

**Client (modify):**
- `client/src/lib/types.ts` — `Thread`, `ThreadState`, two `Settings` fields.
- `client/src/lib/hooks.ts` — `useThreads`, `useSaveThread`, `useDeleteThread`.
- `client/src/App.tsx` — `/now` route, home redirect, `NowProvider`.
- `client/src/features/Layout.tsx` — `Now` nav item, ready badge, `<NowStrip />`.
- `client/src/features/Layout.test.tsx` — shortcut indices shift by one.
- `client/src/features/settings/Settings.tsx` — WIP limit stepper, nudges toggle.

**Split rationale:** `nextUp.ts` and `notify.ts` are separated from the components because they are the only parts with real logic, and they are the parts worth testing. The components are presentational and are covered by using them.

---

### Task 1: Threads table, API, and shared types

**Files:**
- Create: `server/src/threads.test.ts`
- Modify: `server/src/db.ts` (inside the `migrate()` `sqlite.exec` template, after the `vacation_days` block)
- Modify: `server/src/schema.ts` (after the `notes` table, ~line 153)
- Modify: `server/src/api.ts` (auth block ~line 74; new route section after the notes section ~line 478; export ~line 573; import ~line 592)
- Modify: `server/src/seed.ts` (`DEFAULT_SETTINGS`, ~line 6)
- Modify: `client/src/lib/types.ts` (append `Thread`; extend `Settings`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `threads` drizzle table (`server/src/schema.ts`) with columns `id, userId, title, lane, state, nextStep, wakeAt, waitingOn, taskId, doneAt, touchedAt, createdAt`.
  - REST: `GET /api/threads`, `POST /api/threads`, `PATCH /api/threads/:id`, `DELETE /api/threads/:id`.
  - `client/src/lib/types.ts`: `export type ThreadState = 'active' | 'waiting' | 'parked'` and `export interface Thread { ... }` (exact shape in Step 5).
  - `Settings` gains `wipLimit: number` and `nowNudges: boolean`.

- [ ] **Step 1: Write the failing test**

Create `server/src/threads.test.ts`. Note the two things this file exists to prove: rows are scoped per user, and setting a thread active demotes whatever was active before.

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-threads-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('threads table + CRUD', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let api: typeof import('./api').api;

  async function makeUser(id: string): Promise<string> {
    const { users, authSessions } = await import('./schema');
    const now = Date.now();
    db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', createdAt: now }).run();
    db.insert(authSessions).values({
      id: `sid_${id}`, userId: id, createdAt: now, expiresAt: now + 1e9, userAgent: null,
    }).run();
    return `sid=sid_${id}`;
  }
  const send = (method: string, cookie: string, body: unknown) =>
    ({ method, headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  const get = (cookie: string) => ({ method: 'GET', headers: { cookie } });

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ api } = await import('./api'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the threads table with every column', () => {
    const cols = sqlite.prepare('PRAGMA table_info(threads)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'title', 'lane', 'state', 'next_step',
        'wake_at', 'waiting_on', 'task_id', 'done_at', 'touched_at', 'created_at',
      ]),
    );
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await api.request('/threads', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('creates a thread parked by default, with the optional fields nulled', async () => {
    const cookie = await makeUser('ada');
    const res = await api.request('/threads', send('POST', cookie, { title: 'rewrite intro' }));
    expect(res.status).toBe(201);
    const t = await res.json();
    expect(t.title).toBe('rewrite intro');
    expect(t.state).toBe('parked');
    expect(t.lane).toBeNull();
    expect(t.nextStep).toBeNull();
    expect(t.wakeAt).toBeNull();
    expect(t.waitingOn).toBeNull();
    expect(t.doneAt).toBeNull();
  });

  it('setting a thread active demotes the previously active one to parked', async () => {
    const cookie = await makeUser('bob');
    const a = await (await api.request('/threads', send('POST', cookie, { title: 'A', state: 'active' }))).json();
    const b = await (await api.request('/threads', send('POST', cookie, { title: 'B' }))).json();

    await api.request(`/threads/${b.id}`, send('PATCH', cookie, { state: 'active' }));

    const list = await (await api.request('/threads', get(cookie))).json();
    const byId = Object.fromEntries(list.map((t: any) => [t.id, t]));
    expect(byId[b.id].state).toBe('active');
    expect(byId[a.id].state).toBe('parked');
  });

  it('scopes threads per user', async () => {
    const cookieC = await makeUser('cleo');
    await api.request('/threads', send('POST', cookieC, { title: 'cleo only' }));
    const mine = await (await api.request('/threads', get(cookieC))).json();
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('cleo only');
  });

  it('hides threads finished more than 24h ago, keeps recent ones', async () => {
    const cookie = await makeUser('dee');
    const old = await (await api.request('/threads', send('POST', cookie, { title: 'ancient' }))).json();
    const recent = await (await api.request('/threads', send('POST', cookie, { title: 'just done' }))).json();
    const day = 24 * 60 * 60 * 1000;
    await api.request(`/threads/${old.id}`, send('PATCH', cookie, { doneAt: Date.now() - day - 1000 }));
    await api.request(`/threads/${recent.id}`, send('PATCH', cookie, { doneAt: Date.now() }));

    const titles = (await (await api.request('/threads', get(cookie))).json()).map((t: any) => t.title);
    expect(titles).toContain('just done');
    expect(titles).not.toContain('ancient');
  });

  it('deletes a thread', async () => {
    const cookie = await makeUser('eve');
    const t = await (await api.request('/threads', send('POST', cookie, { title: 'gone soon' }))).json();
    expect((await api.request(`/threads/${t.id}`, { method: 'DELETE', headers: { cookie } })).status).toBe(200);
    expect(await (await api.request('/threads', get(cookie))).json()).toHaveLength(0);
  });

  it('round-trips threads through /export and /import', async () => {
    const cookie = await makeUser('fay');
    await api.request('/threads', send('POST', cookie, { title: 'exported', lane: 'thesis' }));
    const dump = await (await api.request('/export', get(cookie))).json();
    expect(dump.threads).toHaveLength(1);
    expect(dump.threads[0].lane).toBe('thesis');

    const cookieG = await makeUser('gil');
    await api.request('/import', send('POST', cookieG, { threads: dump.threads.map((t: any) => ({ ...t, id: `g_${t.id}` })) }));
    const gils = await (await api.request('/threads', get(cookieG))).json();
    expect(gils.map((t: any) => t.title)).toEqual(['exported']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/threads.test.ts`
Expected: FAIL — `PRAGMA table_info(threads)` returns `[]`, so the first assertion fails, and the route tests 404.

- [ ] **Step 3: Create the table**

In `server/src/db.ts`, inside the big `sqlite.exec(\`...\`)` in `migrate()`, immediately after the `vacation_days` `CREATE UNIQUE INDEX` line and before the closing backtick:

```sql
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      lane TEXT,
      state TEXT NOT NULL DEFAULT 'parked',
      next_step TEXT,
      wake_at INTEGER,
      waiting_on TEXT,
      task_id TEXT,
      done_at INTEGER,
      touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_threads_user_touched ON threads(user_id, touched_at);
```

- [ ] **Step 4: Add the drizzle table**

In `server/src/schema.ts`, after the `notes` table (before `taskAttachments`):

```ts
/** One ball in the air: a unit of work that is in flight right now. Unlike a
 *  task (day-scoped, planned ahead) a thread lives for tens of minutes and is
 *  usually created on the spot. At most one is 'active' per user. */
export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  /** Free-text project lane ("thesis"), typed inline as #lane. Null = none. */
  lane: text('lane'),
  state: text('state').notNull().$type<'active' | 'waiting' | 'parked'>().default('parked'),
  /** One line: where you were / what the next move is. */
  nextStep: text('next_step'),
  /** Epoch ms to poke you at; only meaningful while state = 'waiting'. */
  wakeAt: integer('wake_at'),
  /** Short label for what it is blocked on: "claude", "build", "Ana". */
  waitingOn: text('waiting_on'),
  /** Optional link to a Week task this thread advances. */
  taskId: text('task_id'),
  /** When it left the board; null while it is still in flight. */
  doneAt: integer('done_at'),
  touchedAt: integer('touched_at').notNull(),
  createdAt: integer('created_at').notNull(),
});
```

- [ ] **Step 5: Add the client types**

In `client/src/lib/types.ts`, append:

```ts
export type ThreadState = 'active' | 'waiting' | 'parked';

/** One ball in the air. Not a Task: a Task is a day-scoped plan, a Thread is
 *  what is in flight right now and is usually created on the spot. */
export interface Thread {
  id: string;
  title: string;
  lane: string | null;
  state: ThreadState;
  nextStep: string | null;
  wakeAt: number | null;
  waitingOn: string | null;
  taskId: string | null;
  doneAt: number | null;
  touchedAt: number;
  createdAt: number;
}
```

And extend the existing `Settings` interface with two fields (add them after `weekStart`):

```ts
  /** Max threads in flight on the Now board at once. */
  wipLimit: number;
  /** Desktop notifications when a waiting thread comes due. */
  nowNudges: boolean;
```

- [ ] **Step 6: Add the defaults**

In `server/src/seed.ts`, inside `DEFAULT_SETTINGS`, after `weekStart: 1,`:

```ts
  wipLimit: 3, // max in-flight threads on the Now board
  nowNudges: true, // desktop notification when a waiting thread comes due
```

- [ ] **Step 7: Register auth and add the routes**

In `server/src/api.ts`:

1. Extend the drizzle import on line 3 to include `gt`, `isNull`, `ne`, `or`:

```ts
import { and, asc, desc, eq, gt, gte, isNull, lte, ne, or, sql } from 'drizzle-orm';
```

2. Add `threads` to the schema import on line 5:

```ts
import { habitGroups, habits, notes, restDays, sessions, taskAttachments, tasks, threads, timers, userSettings, users, vacationDays } from './schema';
```

3. Register auth beside the other prefixes (after the `/notes` line, ~line 74):

```ts
api.use('/threads', requireAuth); api.use('/threads/*', requireAuth);
```

4. Add the route section after the notes section (before `/* ---------- task attachments`):

```ts
/* ---------- threads (the Now board) ---------- */
const threadInput = z.object({
  title: z.string().min(1),
  lane: z.string().nullable().optional(),
  state: z.enum(['active', 'waiting', 'parked']).optional(),
  nextStep: z.string().nullable().optional(),
  wakeAt: z.number().nullable().optional(),
  waitingOn: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  doneAt: z.number().nullable().optional(),
});

const THREAD_DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Demote whatever else was active, so 'at most one active' holds even when two
 *  tabs race. Called inside the same statement sequence as the promotion. */
function demoteOtherActive(userId: string, keepId: string, now: number): void {
  db.update(threads).set({ state: 'parked', touchedAt: now })
    .where(and(eq(threads.userId, userId), ne(threads.id, keepId), eq(threads.state, 'active')))
    .run();
}

api.get('/threads', (c) => {
  const cutoff = Date.now() - THREAD_DONE_WINDOW_MS;
  const rows = db.select().from(threads)
    .where(and(eq(threads.userId, uid(c)), or(isNull(threads.doneAt), gt(threads.doneAt, cutoff))))
    // In-flight first (done_at IS NOT NULL sorts 0 before 1), then most recent.
    .orderBy(sql`done_at IS NOT NULL`, desc(threads.touchedAt))
    .all();
  return c.json(rows);
});

api.post('/threads', async (c) => {
  const p = threadInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), title: p.data.title,
    lane: p.data.lane ?? null, state: p.data.state ?? 'parked',
    nextStep: p.data.nextStep ?? null, wakeAt: p.data.wakeAt ?? null,
    waitingOn: p.data.waitingOn ?? null, taskId: p.data.taskId ?? null,
    doneAt: p.data.doneAt ?? null, touchedAt: now, createdAt: now,
  };
  db.insert(threads).values(row).run();
  if (row.state === 'active') demoteOtherActive(row.userId, row.id, now);
  return c.json(row, 201);
});

api.patch('/threads/:id', async (c) => {
  const id = c.req.param('id');
  const p = threadInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const res = db.update(threads).set({ ...p.data, touchedAt: now })
    .where(and(eq(threads.id, id), eq(threads.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  if (p.data.state === 'active') demoteOtherActive(uid(c), id, now);
  return c.json(db.select().from(threads).where(and(eq(threads.id, id), eq(threads.userId, uid(c)))).get());
});

api.delete('/threads/:id', (c) => {
  const res = db.delete(threads)
    .where(and(eq(threads.id, c.req.param('id')), eq(threads.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
```

5. In `/export`, add a line beside `notes:`:

```ts
    threads: db.select().from(threads).where(eq(threads.userId, u)).all(),
```

6. In `/import`, add a line beside the notes line inside the transaction:

```ts
    if (Array.isArray(data.threads)) for (const t of reassign(data.threads)) tx.insert(threads).values(t).onConflictDoNothing().run();
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS — the whole server suite, including the new `threads.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add server/src/db.ts server/src/schema.ts server/src/api.ts server/src/seed.ts server/src/threads.test.ts client/src/lib/types.ts
git commit -m "feat(now): threads table, CRUD API, and shared Thread type"
git push
```

---

### Task 2: The next-up rule

**Files:**
- Create: `client/src/features/now/nextUp.ts`
- Create: `client/src/features/now/nextUp.test.ts`

**Interfaces:**
- Consumes: `Thread`, `ThreadState` from `client/src/lib/types.ts` (Task 1).
- Produces:
  - `inFlight(threads: Thread[]): Thread[]`
  - `activeThread(threads: Thread[]): Thread | null`
  - `isReady(t: Thread, now: number): boolean`
  - `nextUp(threads: Thread[], now: number): { thread: Thread; reason: 'ready' | 'stalest' } | null`
  - `readyCount(threads: Thread[], now: number): number`
  - `atCap(threads: Thread[], limit: number): boolean`

`now` is always a parameter — never call `Date.now()` inside this module, or the tests become time-dependent.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/now/nextUp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Thread } from '../../lib/types';
import { activeThread, atCap, inFlight, isReady, nextUp, readyCount } from './nextUp';

const NOW = 1_700_000_000_000;

function t(over: Partial<Thread> & { id: string }): Thread {
  return {
    title: over.id, lane: null, state: 'parked', nextStep: null, wakeAt: null,
    waitingOn: null, taskId: null, doneAt: null, touchedAt: NOW, createdAt: NOW,
    ...over,
  };
}

describe('inFlight / atCap', () => {
  it('counts only threads that have not been finished', () => {
    const list = [t({ id: 'a' }), t({ id: 'b' }), t({ id: 'c', doneAt: NOW - 1000 })];
    expect(inFlight(list).map((x) => x.id)).toEqual(['a', 'b']);
    expect(atCap(list, 3)).toBe(false);
    expect(atCap(list, 2)).toBe(true);
  });
});

describe('isReady / readyCount', () => {
  it('is ready only when waiting with a wakeAt that has passed', () => {
    expect(isReady(t({ id: 'a', state: 'waiting', wakeAt: NOW - 1 }), NOW)).toBe(true);
    expect(isReady(t({ id: 'b', state: 'waiting', wakeAt: NOW + 1 }), NOW)).toBe(false);
    expect(isReady(t({ id: 'c', state: 'waiting', wakeAt: null }), NOW)).toBe(false);
    expect(isReady(t({ id: 'd', state: 'parked', wakeAt: NOW - 1 }), NOW)).toBe(false);
  });

  it('does not count a finished thread as ready', () => {
    const list = [t({ id: 'a', state: 'waiting', wakeAt: NOW - 1, doneAt: NOW })];
    expect(readyCount(list, NOW)).toBe(0);
  });
});

describe('activeThread', () => {
  it('returns the single active thread, or null', () => {
    expect(activeThread([t({ id: 'a' })])).toBeNull();
    expect(activeThread([t({ id: 'a' }), t({ id: 'b', state: 'active' })])?.id).toBe('b');
  });
});

describe('nextUp', () => {
  it('returns null on an empty board', () => {
    expect(nextUp([], NOW)).toBeNull();
  });

  it('prefers the thread that has been ready longest', () => {
    const list = [
      t({ id: 'recent', state: 'waiting', wakeAt: NOW - 1_000 }),
      t({ id: 'oldest', state: 'waiting', wakeAt: NOW - 60_000 }),
    ];
    expect(nextUp(list, NOW)).toEqual({ thread: expect.objectContaining({ id: 'oldest' }), reason: 'ready' });
  });

  it('surfaces a ready thread even while another thread is active', () => {
    const list = [
      t({ id: 'act', state: 'active' }),
      t({ id: 'rdy', state: 'waiting', wakeAt: NOW - 5 }),
    ];
    expect(nextUp(list, NOW)?.thread.id).toBe('rdy');
  });

  it('falls back to the stalest parked thread when nothing is ready', () => {
    const list = [
      t({ id: 'fresh', touchedAt: NOW - 1_000 }),
      t({ id: 'stale', touchedAt: NOW - 900_000 }),
      t({ id: 'later', state: 'waiting', wakeAt: NOW + 60_000 }),
    ];
    expect(nextUp(list, NOW)).toEqual({ thread: expect.objectContaining({ id: 'stale' }), reason: 'stalest' });
  });

  it('never suggests the active thread or a finished one', () => {
    const list = [t({ id: 'act', state: 'active' }), t({ id: 'done', doneAt: NOW })];
    expect(nextUp(list, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/now/nextUp.test.ts`
Expected: FAIL — `Failed to resolve import "./nextUp"`.

- [ ] **Step 3: Write the implementation**

Create `client/src/features/now/nextUp.ts`:

```ts
import type { Thread } from '../../lib/types';

/** Threads still on the board (not finished). */
export const inFlight = (threads: Thread[]): Thread[] => threads.filter((t) => t.doneAt == null);

/** The one thread you are on, if any. The server guarantees at most one. */
export const activeThread = (threads: Thread[]): Thread | null =>
  inFlight(threads).find((t) => t.state === 'active') ?? null;

/** A waiting thread whose timer has come due — the thing you must not forget. */
export const isReady = (t: Thread, now: number): boolean =>
  t.doneAt == null && t.state === 'waiting' && t.wakeAt != null && t.wakeAt <= now;

export const readyCount = (threads: Thread[], now: number): number =>
  threads.filter((t) => isReady(t, now)).length;

/** True once the board is full: adding another thread must be refused. */
export const atCap = (threads: Thread[], limit: number): boolean => inFlight(threads).length >= limit;

/**
 * What to pick up next. Deliberately deterministic — the whole point is that the
 * switch point costs no decision.
 *
 *   1. The thread that has been ready longest (its timer fired first).
 *   2. Otherwise the parked thread untouched for longest.
 *   3. Otherwise nothing.
 *
 * The active thread is never suggested: you are already on it.
 */
export function nextUp(threads: Thread[], now: number): { thread: Thread; reason: 'ready' | 'stalest' } | null {
  const live = inFlight(threads).filter((t) => t.state !== 'active');

  const ready = live.filter((t) => isReady(t, now)).sort((a, b) => (a.wakeAt ?? 0) - (b.wakeAt ?? 0));
  if (ready.length) return { thread: ready[0], reason: 'ready' };

  const parked = live.filter((t) => t.state === 'parked').sort((a, b) => a.touchedAt - b.touchedAt);
  if (parked.length) return { thread: parked[0], reason: 'stalest' };

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/now/nextUp.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/now/nextUp.ts client/src/features/now/nextUp.test.ts
git commit -m "feat(now): deterministic next-up rule for the Now board"
git push
```

---

### Task 3: Due detection and desktop notifications

**Files:**
- Create: `client/src/features/now/notify.ts`
- Create: `client/src/features/now/notify.test.ts`

**Interfaces:**
- Consumes: `Thread` (Task 1); `isReady` (Task 2).
- Produces:
  - `dueThreads(input: DueInput): Thread[]`
  - `loadNotified(): string[]` / `saveNotified(ids: string[]): void`
  - `ensureNotifyPermission(): Promise<boolean>`
  - `fireThreadNotification(t: Thread): void`
  - `NOTIFY_STALE_MS` (number)

**Why the stale guard exists:** the service worker serves `/api` NetworkFirst, so reopening the laptop can hand the client rows whose `wakeAt` passed hours ago. Without the guard, resuming a session fires a burst of notifications for threads you already dealt with.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/now/notify.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Thread } from '../../lib/types';
import { NOTIFY_STALE_MS, dueThreads, loadNotified, saveNotified } from './notify';

const NOW = 1_700_000_000_000;

function t(over: Partial<Thread> & { id: string }): Thread {
  return {
    title: over.id, lane: null, state: 'waiting', nextStep: null, wakeAt: NOW - 1_000,
    waitingOn: null, taskId: null, doneAt: null, touchedAt: NOW, createdAt: NOW,
    ...over,
  };
}

describe('dueThreads', () => {
  it('returns a waiting thread whose timer just fired', () => {
    expect(dueThreads({ threads: [t({ id: 'a' })], now: NOW, notified: [] }).map((x) => x.id)).toEqual(['a']);
  });

  it('does not return a thread that was already notified', () => {
    expect(dueThreads({ threads: [t({ id: 'a' })], now: NOW, notified: ['a'] })).toEqual([]);
  });

  it('does not return a thread whose wakeAt is older than the stale window', () => {
    const ancient = t({ id: 'a', wakeAt: NOW - NOTIFY_STALE_MS - 1 });
    expect(dueThreads({ threads: [ancient], now: NOW, notified: [] })).toEqual([]);
  });

  it('does not return a thread that is not due yet', () => {
    expect(dueThreads({ threads: [t({ id: 'a', wakeAt: NOW + 1 })], now: NOW, notified: [] })).toEqual([]);
  });

  it('returns nothing while nudges are muted', () => {
    expect(dueThreads({ threads: [t({ id: 'a' })], now: NOW, notified: [], muted: true })).toEqual([]);
  });

  it('ignores parked and finished threads', () => {
    const list = [t({ id: 'p', state: 'parked' }), t({ id: 'd', doneAt: NOW })];
    expect(dueThreads({ threads: list, now: NOW, notified: [] })).toEqual([]);
  });
});

describe('notified id persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage so a reload does not re-fire', () => {
    saveNotified(['a', 'b']);
    expect(loadNotified()).toEqual(['a', 'b']);
  });

  it('returns an empty list when storage is empty or corrupt', () => {
    expect(loadNotified()).toEqual([]);
    localStorage.setItem('now.notified', 'not json');
    expect(loadNotified()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/now/notify.test.ts`
Expected: FAIL — `Failed to resolve import "./notify"`.

- [ ] **Step 3: Write the implementation**

Create `client/src/features/now/notify.ts`:

```ts
import type { Thread } from '../../lib/types';
import { isReady } from './nextUp';

/** How far past its wakeAt a thread may be and still be worth notifying about.
 *  The /api service-worker cache is NetworkFirst, so a resumed session can hand
 *  us rows that came due hours ago; firing for those is pure noise. */
export const NOTIFY_STALE_MS = 10 * 60 * 1000;

const STORAGE_KEY = 'now.notified';

export interface DueInput {
  threads: Thread[];
  now: number;
  /** Ids already notified about, so each thread pokes you exactly once. */
  notified: string[];
  muted?: boolean;
}

export function dueThreads({ threads, now, notified, muted = false }: DueInput): Thread[] {
  if (muted) return [];
  const seen = new Set(notified);
  return threads.filter(
    (t) => isReady(t, now) && !seen.has(t.id) && now - (t.wakeAt ?? 0) <= NOTIFY_STALE_MS,
  );
}

export function loadNotified(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveNotified(ids: string[]): void {
  try {
    // Keep it bounded; only recent ids matter for dedupe.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-100)));
  } catch {
    /* private mode / quota — dedupe degrades to per-session, which is fine */
  }
}

/** Ask for permission at the moment a wake-at is set — never on page load, where
 *  it gets reflexively denied and can't be asked again. */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function fireThreadNotification(t: Thread): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const body = t.nextStep || (t.waitingOn ? `Waiting on ${t.waitingOn}` : 'Ready to pick up');
  const opts: NotificationOptions = { body, tag: `thread-${t.id}`, icon: '/pwa-192.png' };
  // Prefer the service worker so an installed PWA behaves the same as a tab.
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification(t.title, opts))
    .catch(() => { new Notification(t.title, opts); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/now/notify.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/now/notify.ts client/src/features/now/notify.test.ts
git commit -m "feat(now): due-thread detection with dedupe and a stale-wake guard"
git push
```

---

### Task 4: Data hooks and the NowProvider

**Files:**
- Modify: `client/src/lib/hooks.ts` (append after the notes hooks, ~line 214)
- Create: `client/src/features/now/NowContext.tsx`

**Interfaces:**
- Consumes: `Thread` (Task 1); `nextUp`, `activeThread`, `readyCount`, `atCap` (Task 2); `dueThreads`, `loadNotified`, `saveNotified`, `fireThreadNotification` (Task 3).
- Produces:
  - `useThreads()`, `useSaveThread()`, `useDeleteThread()` in `client/src/lib/hooks.ts`.
  - `NowProvider` and `useNowOptional(): NowValue | null` from `NowContext.tsx`, where:

```ts
interface NowValue {
  threads: Thread[];
  now: number;
  active: Thread | null;
  suggestion: { thread: Thread; reason: 'ready' | 'stalest' } | null;
  ready: number;
  full: boolean;
  limit: number;
}
```

`useNowOptional` returns `null` outside a provider — `Layout` renders in tests with no provider and must not throw. This mirrors `useAgentsOptional()` in `client/src/features/agents/AgentsContext.tsx`.

- [ ] **Step 1: Add the query hooks**

In `client/src/lib/hooks.ts`, add `Thread` to the type import at the top of the file, then append after the notes hooks:

```ts
/* ---- threads (the Now board) ---- */
export const useThreads = () => useQuery({ queryKey: ['threads'], queryFn: () => api.get<Thread[]>('/threads') });

export function useSaveThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: Partial<Thread> & { id?: string }) =>
      t.id ? api.patch<Thread>(`/threads/${t.id}`, t) : api.post<Thread>('/threads', t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threads'] }),
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/threads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threads'] }),
  });
}
```

- [ ] **Step 2: Write the provider**

Create `client/src/features/now/NowContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Thread } from '../../lib/types';
import { useSettings, useThreads } from '../../lib/hooks';
import { activeThread, atCap, nextUp, readyCount } from './nextUp';
import { dueThreads, fireThreadNotification, loadNotified, saveNotified } from './notify';

export interface NowValue {
  threads: Thread[];
  /** Ticking clock, so countdowns and readiness re-render without each row owning a timer. */
  now: number;
  active: Thread | null;
  suggestion: { thread: Thread; reason: 'ready' | 'stalest' } | null;
  ready: number;
  full: boolean;
  limit: number;
}

const Ctx = createContext<NowValue | null>(null);

/** Null outside a provider — Layout renders without one in tests. */
export const useNowOptional = (): NowValue | null => useContext(Ctx);

const TICK_MS = 5_000;
const DEFAULT_WIP_LIMIT = 3;

export function NowProvider({ children }: { children: ReactNode }) {
  const { data: threads = [] } = useThreads();
  const { data: settings } = useSettings();
  const [now, setNow] = useState(() => Date.now());
  const notified = useRef<string[]>(loadNotified());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // A cached /api/settings response predating this feature has neither field.
  const limit = settings?.wipLimit ?? DEFAULT_WIP_LIMIT;
  const muted = settings?.nowNudges === false;

  const ready = readyCount(threads, now);

  // Poke once per thread that comes due.
  useEffect(() => {
    const due = dueThreads({ threads, now, notified: notified.current, muted });
    if (!due.length) return;
    for (const t of due) fireThreadNotification(t);
    notified.current = [...notified.current, ...due.map((t) => t.id)];
    saveNotified(notified.current);
  }, [threads, now, muted]);

  // The tab title is the one surface visible with the window in the background.
  useEffect(() => {
    document.title = ready > 0 ? `(${ready}) ready · Timer` : 'Timer';
  }, [ready]);

  const value = useMemo<NowValue>(() => ({
    threads,
    now,
    active: activeThread(threads),
    suggestion: nextUp(threads, now),
    ready,
    full: atCap(threads, limit),
    limit,
  }), [threads, now, ready, limit]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: clean. If `Thread` is reported as unused-but-imported in `hooks.ts`, you missed adding one of the three hooks.

- [ ] **Step 4: Run the client suite to confirm nothing regressed**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/hooks.ts client/src/features/now/NowContext.tsx
git commit -m "feat(now): thread query hooks and the NowProvider clock/notifier"
git push
```

---

### Task 5: The Now board page

**Files:**
- Create: `client/src/features/now/AddThread.tsx`
- Create: `client/src/features/now/ThreadCard.tsx`
- Create: `client/src/features/now/ThreadRow.tsx`
- Create: `client/src/features/now/NowBoard.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `useNowOptional` (Task 4); `useSaveThread`, `useDeleteThread` (Task 4); `ensureNotifyPermission` (Task 3); `extractTags` from `client/src/features/notes/noteTags.ts`.
- Produces: the `/now` route; `<NowBoard />`.

**Reuse note:** `#lane` parsing reuses `extractTags` from the notes feature rather than adding a second hashtag regex. Style classes (`card`, `btn-outline`, `hero`) are existing Tailwind component classes used across the app — follow `Notes.tsx` for the idiom.

- [ ] **Step 1: Write the capture input**

Create `client/src/features/now/AddThread.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useSaveThread } from '../../lib/hooks';
import { extractTags } from '../notes/noteTags';

/** One field, Enter to commit. A trailing/inline #lane sets the project lane and
 *  is stripped from the title, matching how Notes handles #tags. */
export function AddThread({ full, limit }: { full: boolean; limit: number }) {
  const [text, setText] = useState('');
  const save = useSaveThread();

  function submit(e: FormEvent) {
    e.preventDefault();
    const raw = text.trim();
    if (!raw || full) return;
    const lane = extractTags(raw)[0] ?? null;
    const title = raw.replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    save.mutate({ title, lane });
    setText('');
  }

  if (full) {
    return (
      <div className="card p-4 text-sm text-slate-400">
        Board is full — {limit} threads in flight. Finish or drop one before starting another.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card flex items-center gap-2 p-2">
      <Plus size={18} className="ml-1 shrink-0 text-slate-500" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What are you picking up? (#lane optional)"
        className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-500"
      />
    </form>
  );
}
```

- [ ] **Step 2: Write the big card**

Create `client/src/features/now/ThreadCard.tsx`:

```tsx
import { useState } from 'react';
import { Check, Hourglass, Pause, Play } from 'lucide-react';
import type { Thread } from '../../lib/types';
import { useSaveThread } from '../../lib/hooks';
import { ensureNotifyPermission } from './notify';

const WAIT_CHIPS = [5, 15, 30, 60];

/** The one thread you are on (or the one being suggested). Large on purpose: it
 *  is the answer to "what am I doing right now". */
export function ThreadCard({ thread, suggestion }: { thread: Thread; suggestion?: 'ready' | 'stalest' }) {
  const save = useSaveThread();
  const [parking, setParking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [note, setNote] = useState(thread.nextStep ?? '');
  const isActive = thread.state === 'active';

  function park() {
    save.mutate({ id: thread.id, state: 'parked', nextStep: note.trim() || null, wakeAt: null });
    setParking(false);
  }

  async function waitFor(minutes: number | null) {
    if (minutes != null) await ensureNotifyPermission();
    save.mutate({
      id: thread.id, state: 'waiting',
      wakeAt: minutes == null ? null : Date.now() + minutes * 60_000,
      nextStep: note.trim() || thread.nextStep || null,
    });
    setWaiting(false);
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {isActive ? "You're on" : suggestion === 'ready' ? 'Ready for you' : 'Next up'}
      </div>

      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 text-2xl font-bold leading-tight">{thread.title}</h2>
        {thread.lane && (
          <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            {thread.lane}
          </span>
        )}
      </div>

      {thread.nextStep && !parking && (
        <p className="text-sm text-slate-400">
          <span className="text-slate-500">Where you were: </span>{thread.nextStep}
        </p>
      )}

      {parking ? (
        <div className="space-y-2">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') park(); if (e.key === 'Escape') setParking(false); }}
            placeholder="Where were you? (one line)"
            className="w-full rounded-xl bg-ink-700 px-3 py-2 text-sm outline-none placeholder:text-slate-500"
          />
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={park}>Park it</button>
            <button className="btn-outline flex-1" onClick={() => setParking(false)}>Cancel</button>
          </div>
        </div>
      ) : waiting ? (
        <div className="space-y-2">
          <div className="text-sm text-slate-400">Poke me in…</div>
          <div className="flex flex-wrap gap-2">
            {WAIT_CHIPS.map((m) => (
              <button key={m} className="btn-outline px-3 py-1.5 text-sm" onClick={() => waitFor(m)}>{m}m</button>
            ))}
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => waitFor(null)}>No timer</button>
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setWaiting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {isActive ? (
            <>
              <button className="btn-outline flex items-center gap-1.5" onClick={() => setParking(true)}>
                <Pause size={16} /> Park
              </button>
              <button className="btn-outline flex items-center gap-1.5" onClick={() => setWaiting(true)}>
                <Hourglass size={16} /> Waiting on…
              </button>
            </>
          ) : (
            <button
              className="btn-outline flex items-center gap-1.5"
              onClick={() => save.mutate({ id: thread.id, state: 'active', wakeAt: null })}
            >
              <Play size={16} /> Pick this up
            </button>
          )}
          <button
            className="btn-outline flex items-center gap-1.5"
            onClick={() => save.mutate({ id: thread.id, doneAt: Date.now(), state: 'parked', wakeAt: null })}
          >
            <Check size={16} /> Done
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write the compact row**

Create `client/src/features/now/ThreadRow.tsx`:

```tsx
import { Check, Play, X } from 'lucide-react';
import type { Thread } from '../../lib/types';
import { useDeleteThread, useSaveThread } from '../../lib/hooks';
import { isReady } from './nextUp';

/** mm:ss-ish countdown, rounded up to the next minute above a minute. */
function until(ms: number): string {
  const mins = Math.ceil(ms / 60_000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

export function ThreadRow({ thread, now }: { thread: Thread; now: number }) {
  const save = useSaveThread();
  const del = useDeleteThread();
  const ready = isReady(thread, now);

  return (
    <div className="card flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{thread.title}</span>
          {thread.lane && <span className="shrink-0 text-xs text-accent">{thread.lane}</span>}
        </div>
        <div className="truncate text-xs text-slate-400">
          {ready ? (
            <span className="font-semibold text-accent">ready</span>
          ) : thread.state === 'waiting' && thread.wakeAt != null ? (
            <>waiting {thread.waitingOn ? `on ${thread.waitingOn} ` : ''}· {until(thread.wakeAt - now)}</>
          ) : thread.state === 'waiting' ? (
            <>waiting{thread.waitingOn ? ` on ${thread.waitingOn}` : ''} · no timer</>
          ) : (
            thread.nextStep || 'parked'
          )}
        </div>
      </div>

      <button
        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-slate-100"
        title="Pick this up"
        onClick={() => save.mutate({ id: thread.id, state: 'active', wakeAt: null })}
      >
        <Play size={16} />
      </button>
      <button
        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-slate-100"
        title="Done"
        onClick={() => save.mutate({ id: thread.id, doneAt: Date.now(), wakeAt: null })}
      >
        <Check size={16} />
      </button>
      <button
        className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-ink-700 hover:text-slate-100"
        title="Drop"
        onClick={() => del.mutate(thread.id)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `client/src/features/now/NowBoard.tsx`:

```tsx
import { inFlight } from './nextUp';
import { useNowOptional } from './NowContext';
import { AddThread } from './AddThread';
import { ThreadCard } from './ThreadCard';
import { ThreadRow } from './ThreadRow';

export function NowBoard() {
  const now = useNowOptional();
  if (!now) return null;

  const live = inFlight(now.threads);
  const headline = now.active ?? now.suggestion?.thread ?? null;
  const rest = live.filter((t) => t.id !== headline?.id);
  const waiting = rest.filter((t) => t.state === 'waiting');
  const parked = rest.filter((t) => t.state !== 'waiting');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Now</h1>
        <p className="text-sm text-slate-400">
          {live.length} of {now.limit} in flight{now.ready > 0 ? ` · ${now.ready} ready` : ''}
        </p>
      </header>

      {headline ? (
        <ThreadCard
          thread={headline}
          suggestion={now.active ? undefined : now.suggestion?.reason}
        />
      ) : (
        <section className="card p-5 text-sm text-slate-400">
          Nothing in flight. Add the thing you're starting.
        </section>
      )}

      {/* A ready thread outranks whatever you are on — that is the whole point. */}
      {now.active && now.suggestion?.reason === 'ready' && (
        <ThreadCard thread={now.suggestion.thread} suggestion="ready" />
      )}

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting</h2>
          {waiting.map((t) => <ThreadRow key={t.id} thread={t} now={now.now} />)}
        </section>
      )}

      {parked.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Parked</h2>
          {parked.map((t) => <ThreadRow key={t.id} thread={t} now={now.now} />)}
        </section>
      )}

      <AddThread full={now.full} limit={now.limit} />
    </div>
  );
}
```

- [ ] **Step 5: Wire the route**

In `client/src/App.tsx`:

1. Add the imports beside the other feature imports:

```tsx
import { NowBoard } from './features/now/NowBoard';
import { NowProvider } from './features/now/NowContext';
```

2. Change the home redirect and add the route (replacing the existing `path="/"` line):

```tsx
        <Route path="/" element={<Navigate to="/now" replace />} />
        <Route path="/now" element={<NowBoard />} />
```

3. Wrap the routes in `NowProvider`. Replace the return at the end of `AuthedApp`:

```tsx
  // NowProvider wraps everything: the strip, the sidebar badge and the tab title
  // have to work on every page, not just /now.
  return (
    <NowProvider>
      {CC_DASH_ENABLED ? <AgentsProvider>{routes}</AgentsProvider> : routes}
    </NowProvider>
  );
```

- [ ] **Step 6: Verify it runs**

Run the server (`cd server && npx tsx src/index.ts`) and client (`cd client && npm run dev`), open http://localhost:5173, and check by hand:

1. `/` lands on the Now board.
2. Typing `read the paper #thesis` + Enter creates a thread with the lane chip `thesis` and the title `read the paper`.
3. "Pick this up" makes it the headline card; picking up a second thread parks the first.
4. "Waiting on… → 5m" moves it to Waiting with a live countdown; the browser asks for notification permission at that moment and not before.
5. Adding a 4th thread is refused with the "Board is full" message.

- [ ] **Step 7: Run the client suite and typecheck**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/features/now client/src/App.tsx
git commit -m "feat(now): the Now board page with capture, park, wait and done"
git push
```

---

### Task 6: Ambient surfaces in the shell

**Files:**
- Create: `client/src/features/now/NowStrip.tsx`
- Modify: `client/src/features/Layout.tsx`
- Modify: `client/src/features/Layout.test.tsx`

**Interfaces:**
- Consumes: `useNowOptional` (Task 4).
- Produces: `<NowStrip />`; a `Now` nav entry at index 0 of `shortcutTabs`.

**The shift:** `shortcutTabs` is the flattened nav order and drives the 1–9 jump keys. Inserting `Now` first makes `Now`=1 and `Week`=2. `Layout.test.tsx` asserts those indices and must move with it.

- [ ] **Step 1: Update the failing test first**

In `client/src/features/Layout.test.tsx`, add a `/now` route to `renderApp` and shift the shortcut expectations:

```tsx
      <MemoryRouter initialEntries={['/now']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/now" element={<div>now page</div>} />
          <Route path="/week" element={<div>week page</div>} />
```

Then in the first test:

```tsx
  it('jumps to the tab at that position in the sidebar', () => {
    renderApp();
    fireEvent.keyDown(window, { key: '4' });
    expect(screen.getByText('habits page')).toBeDefined();
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByText('timer page')).toBeDefined();
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByText('week page')).toBeDefined();
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByText('now page')).toBeDefined();
  });
```

And in the other two tests, replace every `expect(screen.getByText('week page'))` with `expect(screen.getByText('now page'))`, since `/now` is now the starting entry.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run src/features/Layout.test.tsx`
Expected: FAIL — there is no `Now` tab yet, so `1` still lands on Week and `now page` is never rendered.

- [ ] **Step 3: Write the strip**

Create `client/src/features/now/NowStrip.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { inFlight } from './nextUp';
import { useNowOptional } from './NowContext';

/** A one-line answer to "what am I in the middle of", on every page. Renders
 *  nothing when the board is empty, so a single-tasking day costs no chrome. */
export function NowStrip() {
  const now = useNowOptional();
  if (!now) return null;

  const live = inFlight(now.threads);
  if (live.length === 0) return null;

  const waiting = live.filter((t) => t.state === 'waiting').length;

  return (
    <Link
      to="/now"
      className="mb-4 flex items-center gap-2 rounded-xl border border-ink-600/70 bg-ink-800/60 px-3 py-2 text-sm backdrop-blur hover:bg-ink-700/70"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      <span className="min-w-0 flex-1 truncate">
        {now.active ? now.active.title : <span className="text-slate-400">nothing active</span>}
      </span>
      {waiting > 0 && <span className="shrink-0 text-xs text-slate-400">{waiting} waiting</span>}
      {now.ready > 0 && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: 'rgb(217 144 30)' }}>
          {now.ready} ready
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Wire it into Layout**

In `client/src/features/Layout.tsx`:

1. Add `Layers` to the lucide import list and the two Now imports:

```tsx
import {
  CalendarDays, Timer, Repeat, BarChart3, StickyNote, Settings, Bot, Layers, type LucideIcon,
} from 'lucide-react';
import { useNowOptional } from './now/NowContext';
import { NowStrip } from './now/NowStrip';
```

2. Put `Now` first in the `Plan` group:

```tsx
  {
    title: 'Plan',
    tabs: [
      { to: '/now', label: 'Now', icon: Layers },
      { to: '/week', label: 'Week', icon: CalendarDays },
    ],
  },
```

3. Put it first on the mobile bar too, and drop `Notes` to keep the `grid-cols-6` count:

```tsx
const mobileTabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/now', label: 'Now', icon: Layers },
  { to: '/week', label: 'Week', icon: CalendarDays },
  { to: '/timer', label: 'Timer', icon: Timer },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/stats', label: 'Progress', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];
```

4. Inside `Layout()`, read the ready count next to the existing agents line:

```tsx
  const nowCtx = useNowOptional();
  const ready = nowCtx?.ready ?? 0;
```

5. Badge the Now tab. Replace the badge expression in the sidebar `NavLink` with:

```tsx
                {t.to === '/agents' && waiting > 0 ? (
                  <span className="ml-auto rounded-full px-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: 'rgb(217 144 30)' }}>{waiting}</span>
                ) : t.to === '/now' && ready > 0 ? (
                  <span className="ml-auto rounded-full px-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: 'rgb(217 144 30)' }}>{ready}</span>
                ) : shortcutKeyOf(t.to) && (
```

6. Render the strip at the top of the main column:

```tsx
        <div className="mx-auto max-w-6xl">
          <NowStrip />
          <Outlet />
        </div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run`
Expected: PASS — `Layout.test.tsx` included. `NowStrip` and the badge both no-op without a provider, which is why the test needs no `QueryClientProvider`.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/now/NowStrip.tsx client/src/features/Layout.tsx client/src/features/Layout.test.tsx
git commit -m "feat(now): ambient Now strip, sidebar tab and ready badge"
git push
```

---

### Task 7: Settings controls

**Files:**
- Modify: `client/src/features/settings/Settings.tsx`

**Interfaces:**
- Consumes: `Settings.wipLimit`, `Settings.nowNudges` (Task 1); `useSettings`, `useSaveSettings` (existing); `Stepper` from `client/src/components/Stepper.tsx` (existing); `ensureNotifyPermission` (Task 3).
- Produces: nothing downstream.

- [ ] **Step 1: Widen the Toggle type**

The existing `Toggle` helper in `SettingsPage` is typed to three keys. Extend it:

```tsx
  const Toggle = ({ k, label }: { k: 'beeps' | 'voice' | 'keepAwake' | 'nowNudges'; label: string }) => (
```

- [ ] **Step 2: Add the section**

Insert a new section in the returned JSX, after the "Signed in as" card:

```tsx
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Now board</h2>

        <Stepper
          label="Threads in flight at once"
          value={s?.wipLimit ?? 3}
          min={1}
          max={6}
          onChange={(v) => save.mutate({ wipLimit: v })}
        />
        <p className="text-xs text-slate-500">
          The cap is the point: at the limit you must finish or drop something before starting another.
        </p>

        <Toggle k="nowNudges" label="Desktop notification when a thread is ready" />
        <button
          className="btn-outline w-full"
          onClick={() => ensureNotifyPermission()}
        >
          Allow notifications
        </button>
      </section>
```

Add the import at the top of the file:

```tsx
import { ensureNotifyPermission } from '../now/notify';
```

- [ ] **Step 3: Typecheck and test**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Verify by hand**

With both dev servers up: set the limit to 2, confirm the Now board refuses a third thread and says "2 threads in flight". Set it back to 3. Toggle nudges off and confirm a due thread still shows `ready` in the UI but fires no notification.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/settings/Settings.tsx
git commit -m "feat(now): settings for the WIP limit and desktop nudges"
git push
```

---

### Task 8: Documentation and deploy

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the feature**

In `README.md`, add a bullet at the top of the Features list:

```markdown
- **Now board** — at most three *threads* in flight at once, each one either active, waiting on
  something (with a timer that pokes you when it's ready), or parked with a one-line note about
  where you left it. A strip on every page and a tab-title badge keep the set visible; the board
  always names one **next up** so the switch between threads costs no decision.
```

And update the Navigation bullet, which currently reads `**Week · Habits · Timer · Progress · Settings**`:

```markdown
- **Navigation** — a slim left bar: **Now · Week · Habits · Timer · Progress · Settings**. The Now
  board is the home view; the Week planner (per-day tasks + Google Calendar events) is one key away.
```

- [ ] **Step 2: Run the full suite both sides**

Run: `cd server && npx vitest run && cd ../client && npx vitest run && npx tsc --noEmit`
Expected: PASS on all three.

- [ ] **Step 3: Build the client to catch anything vitest misses**

Run: `cd client && npm run build`
Expected: a clean production build.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(now): document the Now board in the README"
git push
```

- [ ] **Step 5: Deploy**

Run: `./deploy.sh`

This is the only sanctioned deploy path. It tags the running image `timer:prev`, builds while the old container keeps serving, swaps only on a green healthcheck, and rolls back otherwise. Do not hand-run `docker compose up -d --build` on the VPS.

- [ ] **Step 6: Verify prod**

Run: `curl -sI https://timer.musel.dev | head -1` and open the site. Confirm the Now board loads and a thread survives a reload. The change is not done until prod serves it.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Thread fields and invariants | 1 |
| WIP cap (client-enforced) | 2 (`atCap`), 5 (`AddThread`), 7 (setting) |
| Single active, server-enforced | 1 (`demoteOtherActive` + test) |
| Next-up rule | 2 |
| `/now` page and layout | 5 |
| Ambient strip | 6 |
| Sidebar item + ready badge | 6 |
| Tab title | 4 (`NowProvider`) |
| Desktop notification, permission timing, stale guard, mute | 3 + 4 |
| Data & API, auth prefix, export/import | 1 |
| Settings `wipLimit` / `nowNudges` | 1 (defaults + type), 7 (UI) |
| Testing plan | 1, 2, 3, 6 |
| Follow-ups (timer integration, agent auto-detect) | deliberately unimplemented |

**Type consistency:** `Thread` field names are identical across `schema.ts` (camelCase drizzle keys over snake_case columns), `types.ts`, the zod `threadInput`, and every component. `nextUp()` returns `{ thread, reason }` in Task 2 and is destructured as `now.suggestion?.thread` / `now.suggestion?.reason` in Tasks 5 and 6. `useNowOptional()` returns `NowValue | null` and every consumer null-checks it.

**Verified against the real code while writing:** `Stepper` in `client/src/components/Stepper.tsx` takes `{ label?, value, onChange, min?, max?, step?, suffix?, editable? }`, so Task 7 passes `label` rather than wrapping it; the PWA icon is `pwa-192.png` (not `pwa-192x192.png`); `card`, `btn-outline`, `hero` and `bg-accent-soft` all exist in `client/src/index.css`; and `api.del` is the delete helper in `client/src/lib/api.ts`.

**Known deviation from the spec:** the spec's file list named `notify.ts` tests as `notify.test.ts` and this plan keeps that, but the spec did not mention that `mobileTabs` has a fixed `grid-cols-6` layout. Task 6 drops `Notes` from the mobile bar to make room for `Now` rather than breaking the grid. Notes remains reachable on mobile via the sidebar on wider screens and via URL; if that trade is wrong, the alternative is `grid-cols-7`, which crowds the bar on a narrow phone.
