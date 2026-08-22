# Desktops Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Now board with a Desktops board — one card per Ubuntu workspace, Exposé grid, opened card pins full-width, with per-card description, checklist, and comment log.

**Architecture:** A `desktops` table follows the `notes` slice pattern (db.ts → schema.ts → api.ts → hooks.ts) with tasks/comments as JSON columns. Pure array ops live in `cardOps.ts` (tested); components are a grid page (`DesktopsBoard`), a compact card (`DesktopCard`), a pinned editor (`DesktopStage`), and a dashed capture card (`AddDesktop`). The pinned card IS the server-persisted single `focused` desktop. All Now-board code is removed.

**Tech Stack:** Hono + zod + Drizzle/better-sqlite3; React + TanStack Query + Tailwind; vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-desktops-board-design.md`

## Global Constraints

- Node 22 pinned (better-sqlite3 ^11 crashes on Node 24). No dependency changes.
- Auth is opt-in per prefix: `/desktops` MUST be registered with `requireAuth` or it is public.
- Schema changes in three places: `server/src/db.ts` raw SQL, `server/src/schema.ts` drizzle, `client/src/lib/types.ts`.
- Service worker caches `/api` NetworkFirst — read new fields through defaults.
- Conventional Commits; push after every commit; no Claude co-author trailers.
- Displayed desktop number = index+1 in sortOrder-sorted live list (GNOME collapse for free).
- Existing DBs keep the orphaned `threads` table; the CREATE TABLE for it is removed, nothing is dropped.
- Not done until `./deploy.sh` has run and prod serves the new commit.

---

### Task 1: desktops table, API, types — and threads server removal

**Files:**
- Create: `server/src/desktops.test.ts`
- Modify: `server/src/db.ts` (replace the threads CREATE block), `server/src/schema.ts` (replace `threads` export), `server/src/api.ts` (replace threads routes/exports/imports), `server/src/seed.ts` (drop wipLimit/nowNudges), `client/src/lib/types.ts` (replace Thread types, trim Settings)
- Delete: `server/src/threads.test.ts`

**Interfaces:**
- Produces REST `GET|POST /api/desktops`, `PATCH|DELETE /api/desktops/:id`; drizzle `desktops`; client types `Desktop`, `DesktopTask { id, text, done }`, `DesktopComment { id, text, at }`.

- [ ] **Step 1: Failing test** — `server/src/desktops.test.ts`, same harness as the old threads test (throwaway TIMER_DB before imports, `makeUser` cookie helper). Cases: table has columns `id, user_id, title, lane, description, tasks, comments, focused, sort_order, archived_at, created_at, updated_at`; migrate idempotent; GET unauth → 401; POST `{title:'Thesis'}` → 201 with `tasks: []`, `comments: []`, `focused: false`, `archivedAt: null`; PATCH `{focused:true}` on B demotes previously-focused A; per-user scoping; PATCH `{archivedAt: Date.now()}` hides the row from GET; DELETE removes; export/import round-trip on `dump.desktops`.
- [ ] **Step 2: Run** `cd server && npx vitest run src/desktops.test.ts` — FAIL (no table, 404 routes).
- [ ] **Step 3: db.ts** — replace the `CREATE TABLE IF NOT EXISTS threads …` + its index with:

```sql
    CREATE TABLE IF NOT EXISTS desktops (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      lane TEXT,
      description TEXT,
      tasks TEXT NOT NULL DEFAULT '[]',
      comments TEXT NOT NULL DEFAULT '[]',
      focused INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      archived_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_desktops_user_sort ON desktops(user_id, sort_order);
```

- [ ] **Step 4: schema.ts** — replace the `threads` table with:

```ts
/** One card per Ubuntu virtual desktop, mirroring the user's spatial layout.
 *  The displayed number is the row's index+1 in sort_order, so removing one
 *  collapses the numbering exactly like GNOME dynamic workspaces. */
export const desktops = sqliteTable('desktops', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  /** Project tag; colors the chip via categoryColor(lane). */
  lane: text('lane'),
  description: text('description'),
  tasks: text('tasks', { mode: 'json' }).notNull().$type<{ id: string; text: string; done: boolean }[]>(),
  /** Append-only journal, newest first. */
  comments: text('comments', { mode: 'json' }).notNull().$type<{ id: string; text: string; at: number }[]>(),
  /** At most one per user — the desktop you are working on (the pinned card). */
  focused: integer('focused', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull(),
  /** "Done" archives so the journal survives; archived rows are hidden from GET. */
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

- [ ] **Step 5: api.ts** — swap imports (`threads`→`desktops`; drizzle set becomes `and, asc, desc, eq, gte, isNull, lte, ne, sql`), auth line `api.use('/desktops', requireAuth); api.use('/desktops/*', requireAuth);`, and replace the threads section with:

```ts
/* ---------- desktops (one card per Ubuntu workspace) ---------- */
const desktopTask = z.object({ id: z.string(), text: z.string().min(1), done: z.boolean() });
const desktopComment = z.object({ id: z.string(), text: z.string().min(1), at: z.number() });
const desktopInput = z.object({
  title: z.string().min(1),
  lane: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tasks: z.array(desktopTask).optional(),
  comments: z.array(desktopComment).optional(),
  focused: z.boolean().optional(),
  sortOrder: z.number().optional(),
  archivedAt: z.number().nullable().optional(),
});

/** Keep 'at most one focused per user' true even when two tabs race. */
function demoteOtherFocused(userId: string, keepId: string, now: number): void {
  db.update(desktops).set({ focused: false, updatedAt: now })
    .where(and(eq(desktops.userId, userId), ne(desktops.id, keepId), eq(desktops.focused, true)))
    .run();
}

api.get('/desktops', (c) =>
  c.json(db.select().from(desktops)
    .where(and(eq(desktops.userId, uid(c)), isNull(desktops.archivedAt)))
    .orderBy(asc(desktops.sortOrder), asc(desktops.createdAt)).all()));

api.post('/desktops', async (c) => {
  const p = desktopInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), title: p.data.title,
    lane: p.data.lane ?? null, description: p.data.description ?? null,
    tasks: p.data.tasks ?? [], comments: p.data.comments ?? [],
    focused: p.data.focused ?? false, sortOrder: p.data.sortOrder ?? now,
    archivedAt: p.data.archivedAt ?? null, createdAt: now, updatedAt: now,
  };
  db.insert(desktops).values(row).run();
  if (row.focused) demoteOtherFocused(row.userId, row.id, now);
  return c.json(row, 201);
});

api.patch('/desktops/:id', async (c) => {
  const id = c.req.param('id');
  const p = desktopInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const res = db.update(desktops).set({ ...p.data, updatedAt: now })
    .where(and(eq(desktops.id, id), eq(desktops.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  if (p.data.focused === true) demoteOtherFocused(uid(c), id, now);
  return c.json(db.select().from(desktops).where(and(eq(desktops.id, id), eq(desktops.userId, uid(c)))).get());
});

api.delete('/desktops/:id', (c) => {
  const res = db.delete(desktops)
    .where(and(eq(desktops.id, c.req.param('id')), eq(desktops.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
```

Export gains `desktops: db.select().from(desktops).where(eq(desktops.userId, u)).all(),` (threads line removed); import gains the matching `data.desktops` loop (threads loop removed).

- [ ] **Step 6: seed.ts** — delete the `wipLimit` and `nowNudges` lines. **types.ts** — delete `Thread`/`ThreadState` and the two Settings fields; append `DesktopTask`, `DesktopComment`, `Desktop` (camelCase mirror of the drizzle table).
- [ ] **Step 7: Run** `cd server && npx vitest run` (after `rm src/threads.test.ts`) — PASS.
- [ ] **Step 8: Commit** `feat(desktops): desktops table, CRUD API, and shared types; retire threads API`

### Task 2: cardOps + hooks + Now-code removal

**Files:**
- Create: `client/src/features/desktops/cardOps.ts` + `cardOps.test.ts`
- Modify: `client/src/lib/hooks.ts` (thread hooks → desktop hooks), `client/src/features/settings/Settings.tsx` (drop Now section + notify import; Toggle type back to `'beeps' | 'voice' | 'keepAwake'`)
- Delete: `client/src/features/now/` (all 12 files)

**Interfaces:** `toggleTask(tasks, id)`, `addTask(tasks, text)`, `removeTask(tasks, id)`, `addComment(comments, text, at)` (prepends — newest first), `taskProgress(tasks) → { done, total }`; hooks `useDesktops()`, `useSaveDesktop()`, `useDeleteDesktop()` (queryKey `['desktops']`).

- [ ] **Step 1: Failing test** — toggle flips only the matching id; addTask appends with `done:false` and a fresh id; removeTask filters; addComment prepends with the given `at`; taskProgress counts `{done:2,total:3}`; all ops return new arrays (no mutation).
- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3:** Implement `cardOps.ts` (ids via `crypto.randomUUID()`); replace the three thread hooks in `hooks.ts` with desktop equivalents; delete `features/now/`; strip the Settings section.
- [ ] **Step 4:** `npx tsc --noEmit` will still fail on App/Layout (fixed in Task 3) — run only `npx vitest run src/features/desktops/cardOps.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(desktops): card ops, query hooks; remove the Now board client code`

### Task 3: the board UI + wiring

**Files:**
- Create: `client/src/features/desktops/DesktopsBoard.tsx`, `DesktopCard.tsx`, `DesktopStage.tsx`, `AddDesktop.tsx`
- Modify: `client/src/App.tsx` (route + no provider), `client/src/features/Layout.tsx` (tab rename, strip/badge removal), `client/src/features/Layout.test.tsx` (`/now`→`/desktops`)

**Interfaces:** `<DesktopsBoard />` at `/desktops` (home); `DesktopCard { desktop, number, onOpen }`; `DesktopStage { desktop, number }`; `AddDesktop { nextNumber }`.

- [ ] **Step 1:** Update `Layout.test.tsx` (route + page names; indices unchanged) — FAIL until Layout is updated.
- [ ] **Step 2:** Components. Board: live list sorted by `sortOrder`, `numberOf = index+1`; pinned `DesktopStage` for the focused card on top; grid (`sm:grid-cols-2 xl:grid-cols-3`) of the rest + `AddDesktop`; Esc unfocuses. Card: mono number badge, title, `categoryColor(lane ?? id)` chip, progress bar, up to 3 open tasks, latest comment; click → `focused:true`. Stage: accent-ring card with title input, lane input, description textarea (save on blur), TASKS column (toggle/add/remove via cardOps), LOG column (prepend note), Done (archive), Delete, collapse. AddDesktop: dashed card, `title #lane` input, Enter → POST (lane via `extractTags`).
- [ ] **Step 3:** App.tsx: drop NowProvider; `/` → `/desktops`, `/desktops` → `<DesktopsBoard />`, `/now` → redirect `/desktops`. Layout.tsx: tab `{ to: '/desktops', label: 'Desktops', icon: Monitor }` (sidebar + mobile), remove NowStrip/useNowOptional/ready badge.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` — PASS. Hands-on Playwright pass on an isolated 8081/5199 pair: create 3 desktops, pin, edit description, add/check tasks, add comments, archive one (numbers collapse), reload persistence.
- [ ] **Step 5: Commit** `feat(desktops): Exposé grid board with pinned stage, tasks and log`

### Task 4: docs + deploy

- [ ] README: replace the Now-board bullet and navigation line with the Desktops board.
- [ ] Full suites both sides + `npm run build`; commit `docs(desktops): document the desktops board`; merge to master; `./deploy.sh`; verify `https://timer.musel.dev/api/desktops` → 401 and the board loads.

## Self-Review

Spec coverage: table/API (T1), JSON columns (T1), focused demote (T1), collapse numbering (T3 numberOf), grid+pin layout (T3), edits in place (T3 Stage), removals incl. Settings keys and nav rename (T1/T2/T3), export/import (T1), tests (T1/T2/T3), deploy (T4). Type names consistent: `Desktop`, `DesktopTask`, `DesktopComment`, hooks `useDesktops/useSaveDesktop/useDeleteDesktop`, ops `toggleTask/addTask/removeTask/addComment/taskProgress`. No placeholders: every code-bearing step names exact fields, routes, and behaviors; component internals are specified by contract and verified by the hands-on pass.
