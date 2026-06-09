# Tasks system + "Daylight" redesign — Design Spec

**Date:** 2026-06-09
**App:** timer (timer.musel.dev) — minimalist interval timer + habit tracker
**Status:** Approved for planning

## Goal

Two changes, designed together:

1. **Re-skin** the app from its current dark theme to a polished, light, minimalist
   look ("Daylight") with a single confident accent and refined typography.
2. **Add a task system** — one-off to-dos organized across **Today / Week / Month /
   Inbox** views — alongside the existing habits and timer features (which stay).

This spec covers both. It deliberately keeps the task feature simple: one-off tasks,
no recurrence, no timer linkage, habits remain a separate concept.

---

## 1. Visual direction — "Daylight"

A full theme change from dark to light, applied across **every** screen (not just the
new task screens) for consistency.

### Tokens
- **Typeface:** General Sans (display + body), loaded from Fontshare
  (`https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap`).
  Numerals use the same family with `tabular-nums`.
- **Palette:**
  - `--bg` warm white `#fbfbfd`
  - `--surface` pure white `#ffffff`
  - `--surface-2` `#f3f4f7` (sidebar / subtle fills)
  - `--border` hairline `#eef0f3` / `#e9ebef`
  - `--text` ink `#1b1c22`
  - `--muted` `#6b7180`
  - `--faint` `#a2a8b5`
  - `--accent` cobalt `#3a6df0` (default; remains user-customizable)
  - `--accent-soft` `rgb(58 109 240 / 0.10)`
- **Surfaces:** 15–16px rounded cards, soft layered shadow
  `0 4px 20px rgba(20,30,60,.05)`, flat fills, **no heavy gradients**.

### Implementation approach
The current theme is hard-coded around dark `ink-*` greys and `slate-*` text, with the
accent already driven by a CSS variable. We will:
- Introduce **semantic CSS-variable tokens** (`--bg`, `--surface`, `--surface-2`,
  `--border`, `--text`, `--muted`, `--faint`, `--accent`, `--accent-soft`) in
  `index.css`.
- Map Tailwind theme colors to those variables in `tailwind.config.js` (e.g.
  `bg-surface`, `text-muted`, `border-hair`) so component classes read semantically.
- Re-point the existing `.card`, `.btn-*`, `.chip`, `.input`, `.label` component
  classes to the new tokens. Because most screens already use these component classes
  and the accent variable, the re-theme is mostly centralized; per-screen touch-ups
  cover any hard-coded `ink-*`/`slate-*` usages.
- Keep accent customization (the existing 6 accent choices) but default to cobalt and
  ensure all 6 read well on a light background; adjust any that don't.
- Restyle both the desktop sidebar and the mobile bottom nav.

### Acceptance
- All screens (Today, Week, Month, Inbox, Focus, Habits, Progress, Settings, Login,
  RunScreen) render in the light Daylight theme with no leftover dark surfaces or
  unreadable contrast.
- Accent switching still works and looks correct on light.

---

## 2. Navigation & information architecture

Sidebar reorganized into two labeled groups. Mobile bottom nav surfaces the most-used
items (Today, Week, Focus, Progress, Settings) with the rest reachable from Today /
overflow.

**Plan** (new)
- **Today** — landing screen / dashboard.
- **Week** — planner board.
- **Month** — calendar.
- **Inbox** — undated tasks.

**Tools** (existing, re-skinned)
- **Focus** — Pomodoro (unchanged behavior).
- **Habits** — habit library + editor (today's existing Dashboard habit grid + habit
  editing) and Timers library.
- **Progress** — stats (unchanged behavior).
- **Settings** — settings (unchanged behavior).

### "Today" is the home/dashboard
The **Today** route is the app's landing page and combines:
- Today's **task list** (the primary new content),
- a compact **habits strip** (today's active habits with their duration chips — reuses
  current Dashboard habit behavior),
- a **focus-timer shortcut**,
- the **streak / today summary** header.

There is no separate bare "today tasks" page — Today is the unified overview.

---

## 3. Task data model

A single new `tasks` table. The entire system is driven by one nullable `date` field.
No recurrence, priorities, projects, or subtasks.

### Fields
| Field | Type | Notes |
|---|---|---|
| `id` | text PK | `newId()` |
| `userId` | text | owner |
| `title` | text, required | |
| `notes` | text, nullable | optional detail |
| `date` | text, nullable | `YYYY-MM-DD` local date, or `null` (= Inbox) |
| `done` | boolean (int) | default false |
| `completedAt` | int, nullable | epoch ms when completed |
| `sortOrder` | int | for manual ordering within a day/list |
| `createdAt` | int | epoch ms |

### Placement rules (derived from `date`, not stored separately)
- `date == today` → **Today**
- `date` within the viewed week → that day's **Week** column
- `date` within the viewed month → **Month** calendar, on its day
- `date == null` → **Inbox**

Dates are **local calendar dates** (`YYYY-MM-DD` strings), not timestamps, to avoid
timezone drift in day/week/month bucketing. A `lib/date.ts`-style helper converts
between local `Date` and these keys, and computes week ranges respecting the existing
`settings.weekStart`.

---

## 4. The four task views

### Today (`/`)
- Clean checklist of tasks where `date == today`.
- **Quick-add** input at top: type title, Enter creates a task dated today.
- Click a row to edit (title/notes/date); checkbox toggles `done` (optimistic).
- Completed tasks show struck-through, de-emphasized; remain visible for the day.
- Below the list: compact habits strip + focus shortcut + streak (see §2).

### Week (`/week`)
- 7 day-columns for the current week (ordered by `settings.weekStart`).
- Header with current week label and ‹ › to move weeks; "This week" button returns to
  current.
- Each column lists tasks for that date; per-column quick-add (creates task on that
  date — **no date typing**).
- **Drag and drop** (via `@dnd-kit/core` + `@dnd-kit/sortable`): drag a task between
  days (updates `date`) or in from the Inbox panel. Reordering within a column updates
  `sortOrder`.
- An **Inbox rail** (collapsible) on the side of the week board to drag undated tasks
  onto days.

### Month (`/month`)
- Calendar grid for the viewed month (weeks ordered by `settings.weekStart`); ‹ › to
  move months; "Today" returns to current.
- Each day cell shows up to N task chips/dots; overflow shows "+k".
- Click a day → a day detail panel/popover listing that day's tasks with quick-add.
- Best surface for longer-term dated tasks.

### Inbox (`/inbox`)
- All tasks where `date == null`, newest first (or `sortOrder`).
- Fast capture input. Drag a task out to Week/Month to schedule, or edit to set a date.

### Shared components
- `TaskRow` — checkbox + title + optional date/notes affordance + edit entry.
- `QuickAdd` — title input that creates a task with a context-supplied date (today / a
  given day / null).
- `TaskEditor` — lightweight inline or modal editor for title, notes, date, delete.

---

## 5. Backend

Mirror the existing habits/timers/sessions patterns exactly.

### Schema & migration
- Add `tasks` table to `server/src/schema.ts` (Drizzle).
- Add `CREATE TABLE IF NOT EXISTS tasks (...)` + indexes
  (`idx_tasks_user`, `idx_tasks_user_date`) to `server/src/db.ts` `migrate()`.

### API (`server/src/api.ts`)
- `api.use('/tasks', requireAuth); api.use('/tasks/*', requireAuth);`
- `GET /tasks` — optionally filtered by `from`/`to` date-key query params (for week/
  month windows); returns all (incl. null-date Inbox) when unfiltered, scoped to the
  user.
- `POST /tasks` — create (zod-validated: `title` required; `date` nullable
  `YYYY-MM-DD`; `notes` nullable).
- `PATCH /tasks/:id` — partial update (title, notes, date, done, sortOrder); set/clear
  `completedAt` when `done` toggles.
- `DELETE /tasks/:id` — delete, user-scoped.
- Add `tasks` to `GET /export` and `POST /import`.

### Validation
Reuse the project's zod conventions; `date` validated as `null` or a `YYYY-MM-DD`
string.

---

## 6. Client integration

- `client/src/lib/types.ts` — add `Task` interface.
- `client/src/lib/hooks.ts` — `useTasks` (query, with optional range), `useSaveTask`,
  `useToggleTask` (optimistic update), `useDeleteTask`, following the existing
  TanStack Query mutation patterns (invalidate `['tasks']`).
- `client/src/lib/date.ts` (new) — local date-key helpers: `todayKey()`,
  `dateKey(d)`, `weekRange(dateKey, weekStart)`, `monthGrid(year, month, weekStart)`.
- `client/src/features/tasks/` (new) — `TodayView.tsx`, `WeekBoard.tsx`,
  `MonthCalendar.tsx`, `Inbox.tsx`, `TaskRow.tsx`, `QuickAdd.tsx`, `TaskEditor.tsx`.
- `client/src/features/Layout.tsx` — new grouped sidebar + mobile nav.
- `client/src/App.tsx` — routes: `/` (Today), `/week`, `/month`, `/inbox` (existing
  `/focus`, `/timers`, `/habits/*`, `/stats`, `/settings` retained; the old `/`
  Dashboard becomes the Today view / its habit grid moves under Habits + the Today
  strip).
- New dependency: `@dnd-kit/core` + `@dnd-kit/sortable` in `client/package.json`.

### Tests
- Server: a `tasks` API test (create/list/filter-by-range/toggle/delete, auth scoping)
  following `auth.test.ts` style.
- Client: unit tests for `lib/date.ts` (week range, month grid, week-start handling)
  following `stats.test.ts` style.

---

## 7. Out of scope (deferred)

Designed-for but **not** built in this round:
- **Recurring tasks** (daily/weekly repetition).
- **Timer ↔ task linking** (timing a task / logging sessions against tasks).
- **Projects / subtasks / priorities.**
- **Color categories** on tasks (the `date`-only model ships first; a `category`
  field can be added later).
- **Google Calendar sync.** The nullable `date` field is kept specifically so a future
  **one-way Task→Calendar push** (the easy direction) is a clean add-on; it requires
  server-side Google OAuth, which is its own project and is not done here.

---

## 8. Acceptance criteria

1. The entire app renders in the light **Daylight** theme (General Sans, cobalt accent,
   white cards, soft shadows); accent switching still works on light.
2. Sidebar shows **Plan** (Today/Week/Month/Inbox) and **Tools** (Focus/Habits/
   Progress/Settings); mobile nav updated.
3. A task can be created from Today (dated today), a Week column (dated that day), a
   Month day (dated that day), and Inbox (undated).
4. A task's `date` fully determines which view(s) it appears in; null-date tasks appear
   only in Inbox.
5. Tasks can be toggled done (optimistic), edited (title/notes/date), reordered, and
   deleted; changes persist via the API and survive reload.
6. Week board supports drag-and-drop between days and from the Inbox rail, updating the
   task's date.
7. Habits, Focus/Pomodoro, and Progress retain their current behavior, re-skinned.
8. Tasks are included in export/import.
9. Server and client tests for the new code pass; existing tests still pass.
