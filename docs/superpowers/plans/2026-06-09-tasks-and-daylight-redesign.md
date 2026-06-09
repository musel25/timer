# Tasks system + "Daylight" redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the timer app from dark to a polished light "Daylight" theme, and add a one-off task system surfaced through Today / Week (planner) / Month (calendar) / Inbox views — keeping the existing habits, focus timer, and progress features.

**Architecture:** The re-skin is centralized: the app's screens already use the `ink-*` (surfaces) and `slate-*` (text) Tailwind scales plus a CSS-variable accent, so we remap those scales to light values and most screens re-theme with zero per-component edits. The task system is a single `tasks` table driven by one nullable local-date string (`YYYY-MM-DD`, or `null` = Inbox); the four views are pure functions of that date. Backend mirrors the existing habits/timers/sessions REST patterns (Hono + Drizzle + better-sqlite3); frontend mirrors the existing TanStack Query hooks + feature-folder structure.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind 3 + React Router 6 + TanStack Query 5 (client); Hono + Drizzle + better-sqlite3 (server); Vitest (tests); `@dnd-kit/core` (week-board drag-and-drop); General Sans via Fontshare.

**Spec:** `docs/superpowers/specs/2026-06-09-tasks-and-daylight-redesign-design.md`

---

## File Structure

**Create:**
- `client/src/lib/date.ts` — local date-key math (today/week/month), pure functions.
- `client/src/lib/date.test.ts` — unit tests for the above.
- `client/src/features/tasks/TaskRow.tsx` — one task line (checkbox + title + edit).
- `client/src/features/tasks/QuickAdd.tsx` — title input that creates a task with a given date.
- `client/src/features/tasks/TaskEditor.tsx` — modal editor (title/notes/date/delete).
- `client/src/features/tasks/TodayView.tsx` — home/dashboard (today's tasks + habits strip + focus + streak).
- `client/src/features/tasks/Inbox.tsx` — undated tasks list.
- `client/src/features/tasks/WeekBoard.tsx` — 7 day-columns + inbox rail, drag-and-drop.
- `client/src/features/tasks/MonthCalendar.tsx` — month grid with per-day task chips.

**Modify:**
- `client/index.html` — light theme meta + General Sans font link.
- `client/src/index.css` — semantic token variables + light component classes.
- `client/tailwind.config.js` — remap `ink`/`slate` scales, accent, font family.
- `client/src/lib/types.ts` — add `Task`.
- `client/src/lib/hooks.ts` — add task hooks.
- `client/src/features/Layout.tsx` — grouped sidebar + mobile nav.
- `client/src/App.tsx` — task routes; Today as home.
- `client/src/features/run/RunScreen.tsx` — one token fix (play-button text color).
- `client/src/features/stats/Progress.tsx` — light empty-heatmap cell color.
- `client/src/features/dashboard/Dashboard.tsx` — repurposed into the Habits-management view (habit grid moves here).
- `server/src/schema.ts` — `tasks` table.
- `server/src/db.ts` — `tasks` migration.
- `server/src/api.ts` — `/tasks` routes + export/import.
- `client/package.json` — add `@dnd-kit/core`.

---

## PHASE 1 — Daylight theme

### Task 1: Load General Sans + switch document to light

**Files:**
- Modify: `client/index.html`

- [ ] **Step 1: Add the font link and flip theme meta**

In `client/index.html`, replace line 2 `<html lang="en" class="dark">` with:

```html
<html lang="en">
```

Replace line 8 `<meta name="theme-color" content="#0b0f14" />` with:

```html
    <meta name="theme-color" content="#fbfbfd" />
```

Replace line 10 `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />` with:

```html
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

Add these two lines inside `<head>` (just before `<title>`):

```html
    <link rel="preconnect" href="https://api.fontshare.com" crossorigin />
    <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Verify the dev server still boots**

Run: `npm --prefix client run build`
Expected: build succeeds (no template errors).

- [ ] **Step 3: Commit**

```bash
git add client/index.html
git commit -m "chore(theme): load General Sans + light document meta"
```

---

### Task 2: Remap color scales + tokens to light (the core re-skin)

**Files:**
- Modify: `client/tailwind.config.js`
- Modify: `client/src/index.css`

- [ ] **Step 1: Rewrite `tailwind.config.js`**

Replace the entire contents of `client/tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Accent stays CSS-variable driven so it remains user-customizable.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent) / 0.10)',
        },
        // `ink-*` = surfaces. Remapped dark->light so existing bg-ink-* classes
        // become light surfaces with no per-component edits.
        // ink-900 (was darkest page bg) -> lightest; used as text color only on
        // accent buttons, where near-white-on-accent is correct.
        ink: {
          900: '#fbfbfd', // page background
          800: '#ffffff', // card / surface
          700: '#f3f4f7', // subtle fill (chips, sidebar)
          600: '#e9ebef', // border
          500: '#a2a8b5', // faint border / disabled
        },
        // `slate-*` = text. Remapped to dark-on-light so existing text-slate-*
        // classes read correctly on a light background.
        slate: {
          100: '#1b1c22', // primary text
          200: '#2b2d36',
          300: '#4b5160',
          400: '#6b7180', // muted text
          500: '#9aa0ad', // faint text
          600: '#a2a8b5',
        },
      },
      fontFamily: {
        sans: ['General Sans', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 20px rgba(20, 30, 60, 0.05)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Rewrite the top of `index.css` (tokens + accent + body)**

In `client/src/index.css`, replace lines 5–22 (the `:root`/accent block through the `body` rule) with:

```css
:root {
  --accent: 58 109 240;
} /* cobalt */
[data-accent='teal'] { --accent: 20 184 166; }
[data-accent='blue'] { --accent: 58 109 240; }   /* cobalt (Daylight default) */
[data-accent='green'] { --accent: 22 160 107; }
[data-accent='violet'] { --accent: 124 92 246; }
[data-accent='rose'] { --accent: 225 45 85; }
[data-accent='amber'] { --accent: 200 131 26; }

html, body, #root { height: 100%; }
html { -webkit-tap-highlight-color: transparent; }

body {
  @apply bg-ink-900 text-slate-100 font-sans antialiased;
  margin: 0;
  overscroll-behavior-y: none;
}
```

- [ ] **Step 3: Update component classes + scrollbar for light**

In `client/src/index.css`, replace the `@layer components { ... }` block (lines 24–47) with:

```css
@layer components {
  .card {
    @apply rounded-2xl bg-ink-800 border border-ink-600 shadow-card;
  }
  .btn {
    @apply inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium
           transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none select-none;
  }
  .btn-accent { @apply btn bg-accent text-white hover:brightness-105; }
  .btn-ghost { @apply btn bg-ink-700 text-slate-100 hover:bg-ink-600; }
  .btn-outline { @apply btn border border-ink-600 text-slate-200 hover:bg-ink-700; }
  .chip {
    @apply inline-flex min-w-[3rem] items-center justify-center rounded-lg border border-ink-600
           bg-ink-700 px-3 py-2 text-sm font-medium text-slate-300 transition
           hover:border-accent/60 hover:text-slate-100 active:scale-95 select-none;
  }
  .chip-active { @apply border-accent bg-accent text-white; }
  .chip-done { @apply border-accent/40 bg-accent-soft text-accent; }
  .input {
    @apply w-full rounded-xl bg-ink-800 border border-ink-600 px-3 py-2.5 text-slate-100
           outline-none focus:border-accent/70 placeholder:text-slate-500;
  }
  .label { @apply text-xs font-semibold uppercase tracking-wide text-slate-400; }
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { @apply bg-ink-600 rounded-full; }
```

- [ ] **Step 4: Build and visually verify**

Run: `npm --prefix client run build`
Expected: build succeeds.
Then run `npm run dev` (repo root) and open the app: pages should now render light (white cards, cobalt accent, General Sans). Header text dark, muted text grey.

- [ ] **Step 5: Commit**

```bash
git add client/tailwind.config.js client/src/index.css
git commit -m "feat(theme): Daylight light palette via remapped ink/slate scales + cobalt accent"
```

---

### Task 3: Fix the two screens with hard-coded dark colors

**Files:**
- Modify: `client/src/features/run/RunScreen.tsx:143`
- Modify: `client/src/features/stats/Progress.tsx:31-34`

- [ ] **Step 1: Fix the RunScreen play-button text color**

The full-screen run overlay intentionally stays dark/immersive. Its play button is white with `text-ink-900`, which now resolves to near-white. In `client/src/features/run/RunScreen.tsx`, line 143, change:

```
className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl text-ink-900 shadow-lg active:scale-95"
```

to:

```
className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl text-[#0b0f14] shadow-lg active:scale-95"
```

- [ ] **Step 2: Fix the Progress heatmap empty-cell color**

In `client/src/features/stats/Progress.tsx`, the `intensity` function returns a hard-coded dark grey for empty days. Replace the function body (lines 30–34) with:

```tsx
  function intensity(min: number): string {
    if (min <= 0) return 'rgb(233 235 239)'; // --border (light empty cell)
    const op = min < 10 ? 0.3 : min < 20 ? 0.5 : min < 40 ? 0.75 : 1;
    return `rgb(var(--accent) / ${op})`;
  }
```

- [ ] **Step 3: Build to verify**

Run: `npm --prefix client run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/run/RunScreen.tsx client/src/features/stats/Progress.tsx
git commit -m "fix(theme): light-mode fixes for run play button + progress heatmap"
```

---

## PHASE 2 — Tasks backend

### Task 4: Add the `tasks` table (schema + migration)

**Files:**
- Modify: `server/src/schema.ts`
- Modify: `server/src/db.ts`

- [ ] **Step 1: Add the Drizzle table**

Append to `server/src/schema.ts` (after the `sessions` table):

```ts
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  notes: text('notes'),
  // local calendar date 'YYYY-MM-DD', or NULL for undated (Inbox)
  date: text('date'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  completedAt: integer('completed_at'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});
```

- [ ] **Step 2: Add the migration**

In `server/src/db.ts`, inside the `migrate()` template literal, add this block before the closing backtick:

```sql
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      date TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
```

- [ ] **Step 3: Build the server to verify schema compiles**

Run: `npm --prefix server run build`
Expected: TypeScript build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/src/schema.ts server/src/db.ts
git commit -m "feat(server): add tasks table + migration"
```

---

### Task 5: Add the `/tasks` API routes + export/import

**Files:**
- Modify: `server/src/api.ts`

- [ ] **Step 1: Import the table**

In `server/src/api.ts`, line 5, add `tasks` to the schema import:

```ts
import { habitGroups, habits, sessions, tasks, timers, userSettings, users } from './schema';
```

- [ ] **Step 2: Add the auth gate**

In `server/src/api.ts`, in the auth `use(...)` block (around line 62–67), add:

```ts
api.use('/tasks', requireAuth); api.use('/tasks/*', requireAuth);
```

- [ ] **Step 3: Add the routes**

In `server/src/api.ts`, after the sessions routes (before the `/* ---------- settings ---------- */` section), add:

```ts
/* ---------- tasks ---------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const taskInput = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  date: z.string().regex(DATE_RE).nullable().optional(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

api.get('/tasks', (c) =>
  c.json(
    db.select().from(tasks).where(eq(tasks.userId, uid(c)))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)).all(),
  ));

api.post('/tasks', async (c) => {
  const p = taskInput.safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const now = Date.now();
  const row = {
    id: newId(), userId: uid(c), title: p.data.title, notes: p.data.notes ?? null,
    date: p.data.date ?? null, done: p.data.done ?? false,
    completedAt: p.data.done ? now : null,
    sortOrder: p.data.sortOrder ?? now, createdAt: now,
  };
  db.insert(tasks).values(row).run();
  return c.json(row, 201);
});

api.patch('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const p = taskInput.partial().safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const patch: Record<string, unknown> = { ...p.data };
  // Keep completedAt in sync when `done` is toggled.
  if (typeof p.data.done === 'boolean') patch.completedAt = p.data.done ? Date.now() : null;
  const res = db.update(tasks).set(patch)
    .where(and(eq(tasks.id, id), eq(tasks.userId, uid(c)))).run();
  if (res.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json(db.select().from(tasks).where(eq(tasks.id, id)).get());
});

api.delete('/tasks/:id', (c) => {
  db.delete(tasks).where(and(eq(tasks.id, c.req.param('id')), eq(tasks.userId, uid(c)))).run();
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Add tasks to export**

In `server/src/api.ts`, in the `GET /export` JSON object, add a `tasks` line (after `sessions`):

```ts
    tasks: db.select().from(tasks).where(eq(tasks.userId, u)).all(),
```

- [ ] **Step 5: Add tasks to import**

In `server/src/api.ts`, inside the `POST /import` transaction (after the sessions import line), add:

```ts
    if (Array.isArray(data.tasks)) for (const t of reassign(data.tasks)) tx.insert(tasks).values(t).onConflictDoNothing().run();
```

- [ ] **Step 6: Build the server to verify**

Run: `npm --prefix server run build`
Expected: TypeScript build succeeds.

- [ ] **Step 7: Smoke-test the routes manually**

Run the dev server (`npm run dev` at repo root), log in, then in the browser devtools console:

```js
await fetch('/api/tasks', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({title:'Test task', date:null})}).then(r=>r.json());
await fetch('/api/tasks').then(r=>r.json());
```

Expected: POST returns a task object with an `id`; GET returns an array containing it.

- [ ] **Step 8: Commit**

```bash
git add server/src/api.ts
git commit -m "feat(server): tasks CRUD routes + export/import"
```

---

## PHASE 3 — Client data layer

### Task 6: Add the `Task` type

**Files:**
- Modify: `client/src/lib/types.ts`

- [ ] **Step 1: Add the interface**

Append to `client/src/lib/types.ts`:

```ts
export interface Task {
  id: string;
  title: string;
  notes: string | null;
  date: string | null; // 'YYYY-MM-DD' local date, or null = Inbox (undated)
  done: boolean;
  completedAt: number | null;
  sortOrder: number;
  createdAt: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/types.ts
git commit -m "feat(client): add Task type"
```

---

### Task 7: Local date-key helpers (TDD)

**Files:**
- Create: `client/src/lib/date.ts`
- Test: `client/src/lib/date.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/date.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dateToKey, keyToDate, addDaysKey, weekDays, monthMatrix, monthLabel, isSameMonth } from './date';

describe('date keys', () => {
  it('round-trips a key through a Date at local midnight', () => {
    const key = '2026-06-09';
    expect(dateToKey(keyToDate(key))).toBe(key);
    expect(keyToDate(key).getHours()).toBe(0);
  });

  it('formats a Date as a zero-padded local key', () => {
    expect(dateToKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('adds days across a month boundary', () => {
    expect(addDaysKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weekDays returns 7 keys starting on the configured week start (Mon=1)', () => {
    const days = weekDays('2026-06-10', 1); // Wed June 10 2026
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-06-08'); // Monday
    expect(days[6]).toBe('2026-06-14'); // Sunday
    expect(days).toContain('2026-06-10');
  });

  it('weekDays respects Sunday start (weekStart=0)', () => {
    const days = weekDays('2026-06-10', 0);
    expect(days[0]).toBe('2026-06-07'); // Sunday
    expect(days[6]).toBe('2026-06-13'); // Saturday
  });

  it('monthMatrix returns whole weeks covering the month, week-start aligned', () => {
    const m = monthMatrix(2026, 5, 1); // June 2026 (month index 5), Monday start
    expect(m[0]).toHaveLength(7);
    expect(m.flat()).toContain('2026-06-01');
    expect(m.flat()).toContain('2026-06-30');
    expect(m[0][0].endsWith('-06-01') || m[0][0] < '2026-06-01').toBe(true); // first cell is on/before the 1st
    expect(m.flat().length % 7).toBe(0);
  });

  it('isSameMonth distinguishes leading/trailing days', () => {
    expect(isSameMonth('2026-06-30', 2026, 5)).toBe(true);
    expect(isSameMonth('2026-07-01', 2026, 5)).toBe(false);
  });

  it('monthLabel renders a human month + year', () => {
    expect(monthLabel(2026, 5)).toBe('June 2026');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix client test -- date`
Expected: FAIL ("Failed to resolve import './date'" / functions not defined).

- [ ] **Step 3: Implement `date.ts`**

Create `client/src/lib/date.ts`:

```ts
/** Local-calendar date helpers keyed as 'YYYY-MM-DD' (no timezone drift). */

const pad = (n: number) => String(n).padStart(2, '0');

/** Format a Date as a local 'YYYY-MM-DD' key. */
export function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a 'YYYY-MM-DD' key into a Date at local midnight. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today's local key. */
export function todayKey(): string {
  return dateToKey(new Date());
}

/** Shift a key by n days (n may be negative). */
export function addDaysKey(key: string, n: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dateToKey(d);
}

/** The 7 day-keys of the week containing `key`, ordered from `weekStart` (0=Sun,1=Mon). */
export function weekDays(key: string, weekStart: number): string[] {
  const d = keyToDate(key);
  const offset = (d.getDay() - weekStart + 7) % 7;
  const start = addDaysKey(key, -offset);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/** True if `key` falls in the given year/month (month is 0-based). */
export function isSameMonth(key: string, year: number, month0: number): boolean {
  const d = keyToDate(key);
  return d.getFullYear() === year && d.getMonth() === month0;
}

/** A matrix of whole weeks (each 7 keys) covering the month, week-start aligned.
 *  'YYYY-MM-DD' strings compare lexicographically === chronologically, so the
 *  string `<=` comparisons below are correct. */
export function monthMatrix(year: number, month0: number, weekStart: number): string[][] {
  const firstKey = dateToKey(new Date(year, month0, 1));
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const lastKey = dateToKey(new Date(year, month0, lastDay));
  let cursor = weekDays(firstKey, weekStart)[0];
  const weeks: string[][] = [];
  while (cursor <= lastKey) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysKey(cursor, i)));
    cursor = addDaysKey(cursor, 7);
  }
  return weeks;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "June 2026" for year/month0. */
export function monthLabel(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix client test -- date`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/date.ts client/src/lib/date.test.ts
git commit -m "feat(client): local date-key helpers with tests"
```

---

### Task 8: Task data hooks

**Files:**
- Modify: `client/src/lib/hooks.ts`

- [ ] **Step 1: Import the Task type**

In `client/src/lib/hooks.ts`, line 3, add `Task` to the type import:

```ts
import type { Habit, HabitGroup, Session, Settings, Task, TimerPreset } from './types';
```

- [ ] **Step 2: Add the query + mutations**

Append to `client/src/lib/hooks.ts`:

```ts
/* ---- tasks ---- */
export const useTasks = () => useQuery({ queryKey: ['tasks'], queryFn: () => api.get<Task[]>('/tasks') });

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: Partial<Task> & { id?: string }) =>
      t.id ? api.patch<Task>(`/tasks/${t.id}`, t) : api.post<Task>('/tasks', t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

/** Optimistic done-toggle: flips the row immediately, rolls back on error. */
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.patch<Task>(`/tasks/${id}`, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const prev = qc.getQueryData<Task[]>(['tasks']);
      qc.setQueryData<Task[]>(['tasks'], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, done, completedAt: done ? Date.now() : null } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/hooks.ts
git commit -m "feat(client): task query + mutation hooks (optimistic toggle)"
```

---

## PHASE 4 — Task UI

### Task 9: Shared task components (TaskRow, QuickAdd, TaskEditor)

**Files:**
- Create: `client/src/features/tasks/TaskRow.tsx`
- Create: `client/src/features/tasks/QuickAdd.tsx`
- Create: `client/src/features/tasks/TaskEditor.tsx`

- [ ] **Step 1: Create `TaskRow.tsx`**

```tsx
import type { Task } from '../../lib/types';
import { useToggleTask } from '../../lib/hooks';

export function TaskRow({ task, onEdit }: { task: Task; onEdit?: (t: Task) => void }) {
  const toggle = useToggleTask();
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
        onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
        className={`h-[18px] w-[18px] shrink-0 rounded-md border-[1.6px] transition ${
          task.done ? 'border-transparent bg-accent' : 'border-ink-500 hover:border-accent'
        }`}
      >
        {task.done && <span className="block text-center text-[11px] leading-[16px] text-white">✓</span>}
      </button>
      <button
        onClick={() => onEdit?.(task)}
        className={`min-w-0 flex-1 truncate text-left text-sm ${task.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
      >
        {task.title}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `QuickAdd.tsx`**

```tsx
import { useState } from 'react';
import { useSaveTask } from '../../lib/hooks';

/** Title input that creates a task with the given date (null = Inbox). */
export function QuickAdd({ date, placeholder = 'Add a task…' }: { date: string | null; placeholder?: string }) {
  const [title, setTitle] = useState('');
  const save = useSaveTask();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    save.mutate({ title: t, date });
    setTitle('');
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-dashed border-ink-600 px-3 py-2">
      <span className="text-slate-400">＋</span>
      <input
        className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
    </form>
  );
}
```

- [ ] **Step 3: Create `TaskEditor.tsx`**

```tsx
import { useState } from 'react';
import type { Task } from '../../lib/types';
import { useSaveTask, useDeleteTask } from '../../lib/hooks';

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState(task.date ?? '');
  const save = useSaveTask();
  const del = useDeleteTask();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    save.mutate({ id: task.id, title: title.trim(), notes: notes.trim() || null, date: date || null });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card w-full max-w-md space-y-3 rounded-b-none rounded-t-2xl p-4 sm:rounded-2xl"
      >
        <input className="input text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
        <textarea className="input min-h-[72px] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        <label className="label">Date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-center justify-between pt-1">
          <button type="button" className="btn-outline text-rose-500" onClick={() => { del.mutate(task.id); onClose(); }}>Delete</button>
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

- [ ] **Step 4: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/tasks/TaskRow.tsx client/src/features/tasks/QuickAdd.tsx client/src/features/tasks/TaskEditor.tsx
git commit -m "feat(tasks): shared TaskRow, QuickAdd, TaskEditor components"
```

---

### Task 10: TodayView (home) + Inbox

**Files:**
- Create: `client/src/features/tasks/TodayView.tsx`
- Create: `client/src/features/tasks/Inbox.tsx`

- [ ] **Step 1: Create `TodayView.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTasks, useHabits, useSessions, useSettings } from '../../lib/hooks';
import type { Habit, Task } from '../../lib/types';
import { currentStreak, todaySummary } from '../../lib/stats';
import { todayKey } from '../../lib/date';
import { useRun } from '../run/RunContext';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

export function TodayView() {
  const { data: tasks = [] } = useTasks();
  const { data: habits = [] } = useHabits();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { startRun } = useRun();
  const [editing, setEditing] = useState<Task | null>(null);

  const tk = todayKey();
  const today = tasks.filter((t) => t.date === tk).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);
  const streak = currentStreak(sessions);
  const summary = todaySummary(sessions);
  const active = habits.filter((h) => !h.archived).slice(0, 6);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function startHabit(habit: Habit, min: number) {
    const prep = settings?.prepSeconds ?? 5;
    startRun({ type: 'simple', label: habit.name, habitId: habit.id, plannedSeconds: min * 60, config: { totalSeconds: min * 60, prepSeconds: prep } });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="pt-1">
        <div className="text-sm text-slate-400">{dateLabel}</div>
        <h1 className="text-2xl font-bold">Today</h1>
        <div className="text-sm text-slate-400">
          {streak > 0 ? `🔥 ${streak}-day streak` : 'Let’s begin'}
          {summary.count > 0 ? ` · ${summary.count} session${summary.count > 1 ? 's' : ''} · ${summary.minutes} min` : ''}
        </div>
      </header>

      <section className="card p-4">
        <h2 className="label mb-2">Tasks</h2>
        <div className="divide-y divide-ink-600">
          {today.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
        </div>
        {today.length === 0 && <p className="py-3 text-sm text-slate-500">Nothing scheduled for today.</p>}
        <div className="mt-2"><QuickAdd date={tk} placeholder="Add a task to today…" /></div>
      </section>

      {active.length > 0 && (
        <section className="card p-4">
          <h2 className="label mb-2">Habits</h2>
          <div className="space-y-1">
            {active.map((h) => (
              <div key={h.id} className="flex items-center gap-2 py-1.5">
                <span className="text-lg">{h.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {h.durations.map((min) => {
                    const done = summary.doneChips.has(`${h.id}:${min}`);
                    return (
                      <button key={min} onClick={() => startHabit(h, min)} className={`chip ${done ? 'chip-done' : ''}`}>
                        {done ? '✓ ' : ''}{min}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/focus" className="btn-accent">🍅 Focus</Link>
        <Link to="/quick" className="btn-ghost">⚡ Quick Timer</Link>
      </div>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Create `Inbox.tsx`**

```tsx
import { useState } from 'react';
import { useTasks } from '../../lib/hooks';
import type { Task } from '../../lib/types';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

export function Inbox() {
  const { data: tasks = [] } = useTasks();
  const [editing, setEditing] = useState<Task | null>(null);
  const inbox = tasks.filter((t) => t.date === null)
    .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="pt-1">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <p className="text-sm text-slate-400">Undated tasks — schedule them from the Week or Month view.</p>
      </header>
      <section className="card p-4">
        <div className="divide-y divide-ink-600">
          {inbox.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
        </div>
        {inbox.length === 0 && <p className="py-3 text-sm text-slate-500">Inbox is empty.</p>}
        <div className="mt-2"><QuickAdd date={null} placeholder="Capture a task…" /></div>
      </section>
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/tasks/TodayView.tsx client/src/features/tasks/Inbox.tsx
git commit -m "feat(tasks): Today (home) and Inbox views"
```

---

### Task 11: MonthCalendar

**Files:**
- Create: `client/src/features/tasks/MonthCalendar.tsx`

- [ ] **Step 1: Create `MonthCalendar.tsx`**

```tsx
import { useState } from 'react';
import { useTasks, useSettings } from '../../lib/hooks';
import type { Task } from '../../lib/types';
import { monthMatrix, monthLabel, isSameMonth, todayKey, keyToDate } from '../../lib/date';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthCalendar() {
  const { data: tasks = [] } = useTasks();
  const { data: settings } = useSettings();
  const weekStart = settings?.weekStart ?? 1;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selected, setSelected] = useState<string>(todayKey());
  const [editing, setEditing] = useState<Task | null>(null);

  const weeks = monthMatrix(year, month0, weekStart);
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) if (t.date) (byDate.get(t.date) ?? byDate.set(t.date, []).get(t.date)!).push(t);
  const dow = Array.from({ length: 7 }, (_, i) => DOW[(weekStart + i) % 7]);
  const selectedTasks = (byDate.get(selected) ?? []).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);

  function shift(delta: number) {
    const m = month0 + delta;
    const y = year + Math.floor(m / 12);
    setYear(y); setMonth0(((m % 12) + 12) % 12);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-bold">{monthLabel(year, month0)}</h1>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-1.5" onClick={() => shift(-1)}>‹</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => { setYear(now.getFullYear()); setMonth0(now.getMonth()); setSelected(todayKey()); }}>Today</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => shift(1)}>›</button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-3">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
            {dow.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((key) => {
              const inMonth = isSameMonth(key, year, month0);
              const isToday = key === todayKey();
              const isSel = key === selected;
              const dayTasks = byDate.get(key) ?? [];
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`flex min-h-[58px] flex-col rounded-lg border p-1.5 text-left transition ${
                    isSel ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-ink-700'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span className={`text-[11px] font-semibold ${isToday ? 'text-accent' : 'text-slate-300'}`}>{keyToDate(key).getDate()}</span>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {dayTasks.slice(0, 3).map((t) => (
                      <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${t.done ? 'bg-ink-500' : 'bg-accent'}`} />
                    ))}
                    {dayTasks.length > 3 && <span className="text-[9px] text-slate-400">+{dayTasks.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="label mb-2">{keyToDate(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          <div className="divide-y divide-ink-600">
            {selectedTasks.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
          </div>
          {selectedTasks.length === 0 && <p className="py-3 text-sm text-slate-500">No tasks this day.</p>}
          <div className="mt-2"><QuickAdd date={selected} placeholder="Add a task…" /></div>
        </div>
      </div>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/tasks/MonthCalendar.tsx
git commit -m "feat(tasks): month calendar view"
```

---

### Task 12: WeekBoard (drag-and-drop planner)

**Files:**
- Modify: `client/package.json` (add `@dnd-kit/core`)
- Create: `client/src/features/tasks/WeekBoard.tsx`

- [ ] **Step 1: Install @dnd-kit/core**

Run: `npm --prefix client install @dnd-kit/core@^6.1.0`
Expected: adds the dependency; `client/package.json` updated.

- [ ] **Step 2: Create `WeekBoard.tsx`**

```tsx
import { useState } from 'react';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useTasks, useSettings, useSaveTask, useToggleTask } from '../../lib/hooks';
import type { Task } from '../../lib/types';
import { weekDays, todayKey, addDaysKey, keyToDate } from '../../lib/date';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

const INBOX = 'inbox';

function DraggableTask({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const toggle = useToggleTask();
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
        className={`h-4 w-4 shrink-0 rounded border-[1.5px] ${task.done ? 'border-transparent bg-accent' : 'border-ink-500'}`}
      >
        {task.done && <span className="block text-center text-[10px] leading-[14px] text-white">✓</span>}
      </button>
      <button onClick={() => onEdit(task)} className={`min-w-0 flex-1 truncate text-left text-[12.5px] ${task.done ? 'text-slate-500 line-through' : ''}`}>
        {task.title}
      </button>
      <span {...attributes} {...listeners} className="cursor-grab px-1 text-slate-400" aria-label="Drag">⠿</span>
    </div>
  );
}

function DropColumn({ id, children, highlight }: { id: string; children: React.ReactNode; highlight?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`min-h-[80px] space-y-1.5 rounded-xl p-1.5 transition ${isOver ? 'bg-accent-soft' : highlight ? 'bg-ink-700/60' : ''}`}>
      {children}
    </div>
  );
}

export function WeekBoard() {
  const { data: tasks = [] } = useTasks();
  const { data: settings } = useSettings();
  const save = useSaveTask();
  const weekStart = settings?.weekStart ?? 1;
  const [anchor, setAnchor] = useState(todayKey());
  const [editing, setEditing] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = weekDays(anchor, weekStart);
  const inbox = tasks.filter((t) => t.date === null && !t.done);
  const byDate = (key: string) => tasks.filter((t) => t.date === key).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const date = over === INBOX ? null : over;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.date !== date) save.mutate({ id: taskId, date });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-bold">Week</h1>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, -7))}>‹</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(todayKey())}>This week</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, 7))}>›</button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
          <div className="card p-3">
            <h2 className="label mb-2">Inbox</h2>
            <DropColumn id={INBOX} highlight>
              {inbox.map((t) => <DraggableTask key={t.id} task={t} onEdit={setEditing} />)}
            </DropColumn>
            <div className="mt-2"><QuickAdd date={null} placeholder="Capture…" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {days.map((key) => {
              const d = keyToDate(key);
              const isToday = key === todayKey();
              return (
                <div key={key} className="card p-2">
                  <div className={`mb-1 px-1 text-xs font-semibold ${isToday ? 'text-accent' : 'text-slate-400'}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
                  </div>
                  <DropColumn id={key}>
                    {byDate(key).map((t) => <DraggableTask key={t.id} task={t} onEdit={setEditing} />)}
                  </DropColumn>
                  <div className="mt-1"><QuickAdd date={key} placeholder="＋" /></div>
                </div>
              );
            })}
          </div>
        </div>
      </DndContext>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: passes (if `@dnd-kit/core` types are missing, re-run Step 1).

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/src/features/tasks/WeekBoard.tsx
git commit -m "feat(tasks): week planner board with drag-and-drop (@dnd-kit)"
```

---

### Task 13: Navigation + routes + repurpose Dashboard into Habits view

**Files:**
- Modify: `client/src/features/Layout.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/features/dashboard/Dashboard.tsx`

- [ ] **Step 1: Rewrite `Layout.tsx` with grouped nav**

Replace the entire contents of `client/src/features/Layout.tsx` with:

```tsx
import { NavLink, Outlet } from 'react-router-dom';

const groups: { title: string; tabs: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  {
    title: 'Plan',
    tabs: [
      { to: '/', label: 'Today', icon: '★', end: true },
      { to: '/week', label: 'Week', icon: '🗓' },
      { to: '/month', label: 'Month', icon: '📅' },
      { to: '/inbox', label: 'Inbox', icon: '📥' },
    ],
  },
  {
    title: 'Tools',
    tabs: [
      { to: '/focus', label: 'Focus', icon: '🍅' },
      { to: '/habits', label: 'Habits', icon: '↻' },
      { to: '/stats', label: 'Progress', icon: '📊' },
      { to: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

// Most-used items for the mobile bottom bar.
const mobileTabs = [
  { to: '/', label: 'Today', icon: '★', end: true },
  { to: '/week', label: 'Week', icon: '🗓' },
  { to: '/focus', label: 'Focus', icon: '🍅' },
  { to: '/stats', label: 'Progress', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Layout() {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-ink-600 px-3 py-5 md:flex">
        <div className="mb-4 flex items-center gap-2 px-3 text-lg font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm text-white">◗</span>Timer
        </div>
        {groups.map((g) => (
          <div key={g.title} className="mt-2">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.title}</div>
            {g.tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-accent-soft text-accent' : 'text-slate-300 hover:bg-ink-700'
                  }`
                }
              >
                <span className="w-5 text-center text-base">{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-ink-600 bg-ink-800/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isActive ? 'text-accent' : 'text-slate-400'}`
              }
            >
              <span className="text-lg">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Update `App.tsx` routes**

In `client/src/App.tsx`, replace the imports of `Dashboard` (line 7) and add the new views. Change line 7:

```tsx
import { Dashboard } from './features/dashboard/Dashboard';
```

to:

```tsx
import { Dashboard } from './features/dashboard/Dashboard';
import { TodayView } from './features/tasks/TodayView';
import { WeekBoard } from './features/tasks/WeekBoard';
import { MonthCalendar } from './features/tasks/MonthCalendar';
import { Inbox } from './features/tasks/Inbox';
```

Then replace the route list inside `<Route element={<Layout />}>` (lines 32–44) with:

```tsx
      <Route element={<Layout />}>
        <Route path="/" element={<TodayView />} />
        <Route path="/week" element={<WeekBoard />} />
        <Route path="/month" element={<MonthCalendar />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/focus" element={<Focus />} />
        <Route path="/quick" element={<QuickTimer />} />
        <Route path="/habits" element={<Dashboard />} />
        <Route path="/timers" element={<TimersLibrary />} />
        <Route path="/timers/new" element={<TimerEditor />} />
        <Route path="/timers/:id" element={<TimerEditor />} />
        <Route path="/habits/new" element={<HabitEditor />} />
        <Route path="/habits/:id" element={<HabitEditor />} />
        <Route path="/stats" element={<Progress />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
```

- [ ] **Step 3: Update the Dashboard header to read as the Habits manager**

The repurposed Dashboard is now reached via `/habits`. In `client/src/features/dashboard/Dashboard.tsx`, replace the `<header>` block (lines 35–46) with:

```tsx
      <header className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-2xl font-bold">Habits</h1>
          <div className="text-sm text-slate-400">
            {today.count > 0 ? `Today · ${today.count} done · ${today.minutes} min` : 'Tap a duration to start a habit'}
          </div>
        </div>
        <Link to="/timers" className="rounded-full bg-ink-700 p-2 text-lg">⏱</Link>
      </header>
```

- [ ] **Step 4: Typecheck + build**

Run: `npm --prefix client run typecheck && npm --prefix client run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/Layout.tsx client/src/App.tsx client/src/features/dashboard/Dashboard.tsx
git commit -m "feat(nav): grouped Plan/Tools sidebar, task routes, Today as home, Dashboard->Habits"
```

---

## PHASE 5 — Verification

### Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test` (repo root)
Expected: server tests (auth) and client tests (stats, date) all PASS.

- [ ] **Step 2: Typecheck + production build both packages**

Run: `npm run build` (repo root)
Expected: server and client builds succeed.

- [ ] **Step 3: Manual end-to-end smoke test**

Run `npm run dev`, log in, then verify:
- App renders light (Daylight) on every screen: Today, Week, Month, Inbox, Focus, Habits, Progress, Settings.
- Create a task from Today (appears in Today), from a Week column (appears on that day), from a Month day (dot appears), and from Inbox (appears undated).
- Drag a task from Inbox onto a Week day → it gets that date; drag between two days → date changes; reload → persists.
- Toggle a task done (strikes through immediately); reload → still done.
- Edit a task's title/date via the editor; delete a task.
- Start a habit from the Today habits strip and from /habits → run screen works; Progress shows the session.
- Switch accent in Settings → accent updates and reads well on light.

- [ ] **Step 4: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for tasks + Daylight redesign"
```

- [ ] **Step 5: Push the branch**

```bash
git push
```

---

## Notes for the implementer

- **Local dates only.** Tasks use `YYYY-MM-DD` strings, never timestamps, so day/week/month bucketing never drifts by timezone. All date math lives in `client/src/lib/date.ts`.
- **The re-skin is mostly free** because screens use `ink-*`/`slate-*`/`accent`. If you spot a screen with a literal dark hex (search `#0` / `rgb(` in `client/src/`), give it a light value — only RunScreen (intentionally dark/immersive) and the Progress heatmap needed it (Task 3).
- **RunScreen stays dark on purpose** — it's the active-timer overlay; only its play-button text token was fixed.
- **Deferred (do not build):** recurrence, timer↔task linking, projects/subtasks, priorities, task color categories, Google Calendar sync. The nullable `date` field is the seam for a future one-way Task→Calendar push.
- **Testing scope deviation from spec §6.** The spec called for a server-side tasks API test "following auth.test.ts style," but `auth.test.ts` only exercises pure functions and the codebase has no DB/HTTP integration-test harness (the `db` connection is a module-level singleton bound to an env path). Rather than introduce that harness, the `/tasks` routes are verified by the manual smoke test (Task 5, Step 7) and the end-to-end pass (Task 14), matching the existing convention where CRUD routes are untested. TDD is applied to the richest pure logic instead — `lib/date.ts` (Task 7). If you later add a DB test harness, a `tasks` API test is the first thing to add.
```
