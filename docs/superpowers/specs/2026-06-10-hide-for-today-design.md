# Hide-for-today — Design

## Problem

The Today view is where the user looks to see "what I still have to do." It shows
two sections: **Tasks** (dated to today) and **Habits** (recurring, shown every
day). Once an item is dealt with — e.g. a daily habit already fulfilled — it stays
on the list as visual noise. The user wants to remove a specific item from Today's
list without deleting it.

## Decisions (from brainstorming)

- **Manual hide, per item.** Each Today item gets its own hide control. No
  auto-hide-on-complete.
- **Hidden just for today.** A hidden item reappears tomorrow on its own. For a
  habit this means "I've done it today, show it again fresh tomorrow." For a task
  (which is only ever in Today on its own date) it effectively means "drop it from
  my Today list."
- **Applies to both tasks and habits.**
- **Today-only.** Hiding affects the Today view only. Week, Month, and Inbox views
  ignore the hidden marker and still show the item.

## Approach

Store a **`hiddenOn` date marker directly on each record** (`tasks` and `habits`
tables), mirroring the existing `archived` flag on `habits`/`timers`. A value of
`'2026-06-10'` means "hidden on that day." The Today view filters out any item
whose `hiddenOn === todayKey()`. The next day the key no longer matches, so the
item reappears automatically — no cleanup job, no stale state.

### Alternatives rejected

- **Settings JSON blob** (`hiddenToday` in `user_settings`): avoids a migration but
  mixes per-item state into a global blob and needs stale-date pruning. Worse fit.
- **Client-only localStorage**: simplest, but the rest of the app is server-synced
  across devices; hide state would silently diverge. Inconsistent.

The `hiddenOn` column is server-synced, matches the existing record-state pattern,
and is self-expiring by construction.

## Pieces

### 1. Schema — `server/src/schema.ts`
Add `hiddenOn: text('hidden_on')` (nullable, `'YYYY-MM-DD'`) to both `tasks` and
`habits`.

### 2. Migration — `server/src/db.ts`
`migrate()` currently only runs `CREATE TABLE IF NOT EXISTS`, which does not add
columns to pre-existing tables. Add a small idempotent helper that, for each of
`tasks` and `habits`, checks `PRAGMA table_info(<table>)` and runs
`ALTER TABLE <table> ADD COLUMN hidden_on TEXT` only when the column is absent.

### 3. API — `server/src/api.ts`
- Hoist `DATE_RE` above `habitInput` so both schemas can reference it.
- Add `hiddenOn: z.string().regex(DATE_RE).nullable().optional()` to both
  `taskInput` and `habitInput`.
- No new routes: the existing `PATCH /tasks/:id` and `PATCH /habits/:id` already
  apply partial updates, so setting/clearing `hiddenOn` works as-is.

### 4. Client types & hooks — `client/src/lib/types.ts`, `client/src/lib/hooks.ts`
- Add `hiddenOn: string | null` to the `Task` and `Habit` interfaces.
- Reuse the existing save hooks (`useSaveTask`, the habit save mutation) with
  `{ id, hiddenOn }` rather than adding dedicated hide hooks. Keep it minimal.

### 5. Today view — `client/src/features/tasks/TodayView.tsx`
- Filter:
  - `today = tasks.filter(t => t.date === tk && t.hiddenOn !== tk)`
  - `active = habits.filter(h => !h.archived && h.hiddenOn !== tk)`
- Per-row hide control (a small muted "×" / eye-off button) that sets
  `hiddenOn = tk` on that record.
- Per section, when one or more items are hidden today, show a muted
  `N hidden · Show` toggle. Expanding it lists the hidden items at reduced opacity
  with an **Unhide** action that clears `hiddenOn` (sets it to `null`). This is the
  in-day recovery path for a misclick; tomorrow everything returns regardless.

### 6. TaskRow — `client/src/features/tasks/TaskRow.tsx`
Accept an optional `onHide?` prop so the hide button renders only in the Today
context. Week/Month rows pass nothing and stay unchanged.

## Testing

- **Server** (`server/src/auth.test.ts` or a sibling): patching `hiddenOn` set +
  clear on a task and a habit round-trips; an invalid date string is rejected (400).
- **Manual**: hide a task and a habit in Today → both disappear; the `Show` toggle
  reveals them; **Unhide** restores them immediately; reload persists the hidden
  state; advancing `todayKey()` (next day) brings both back.

## Out of scope

- Auto-hide on completion.
- Indefinite/archive-style hiding (the "until I unhide it" option was not chosen).
- Hiding in Week / Month / Inbox views.
