# IA Refresh — Slim Nav, Single-Run Focus + Habit Tagging, Habit Drill-down, Vacation Ranges

**Date:** 2026-06-26
**Status:** Approved, ready for implementation plan
**Branch:** `worktree-ia-refresh-focus-vacation` (isolated worktree)

## Problem

Three issues, surfaced by the user:

1. **Repetitive navigation.** Today and Month duplicate what Week already shows (Week
   renders per-day tasks *and* Google Calendar events, with today highlighted). The
   sidebar is heavier than it needs to be.
2. **Confusing focus model.** Two unrelated things are both called "focus": the Timer
   page's **Focus block** (a foreground Pomodoro) and the Habits page's **Focus** button
   (a background "umbrella" countdown in a *separate* run slot). Starting a Focus block on
   the Timer page never appears as the umbrella on Habits, and tapping a habit while a
   foreground timer runs **replaces/kills** it instead of letting the habit run "inside" it.
3. **Vacation defined on the Today header.** The vacation (and rest) toggles clutter the
   Today header and only act on single days; there is no way to mark a *range*.

## Decisions (from brainstorming)

- **Navigation:** sidebar becomes **Week · Habits · Timer · Progress · Settings**. Remove
  Today and Month. Landing route `/` → Week.
- **Focus model — one shared run + habit tagging.** There is exactly one running timer at
  a time. It persists across navigation (already true). Tapping a habit **tags** the
  running block (its time is attributed to that habit); tapping another habit re-tags.
  **No nested second timer.** The separate focus "umbrella" subsystem is **removed**.
- **Per-habit drill-down:** clicking a habit card opens a full-page route with **Overview**
  and **Month** tabs.
- **Vacation/Rest ranges** are painted in the drill-down's **Month** tab (tap start → tap
  end). Both remain **global** (one row per date, applies to all habits) — the calendar is
  just the editing surface. Semantics unchanged: vacation = lighter goal, rest = streak-skip.

## Coordination with the parallel "unified timer page" work

A separate, **already-approved** effort owns the Timer page:
`docs/superpowers/specs/2026-06-26-unified-timer-page-design.md` (+ its plan), being
implemented on branch `feat/unified-timer-page`. It rebuilds `/timer` into a saved-timers
launch grid + quick-start, folds `/timers` → `/timer` (redirect), and makes `TimerEditor`
the single all-types editor (incl. Focus-block/pomodoro).

**This spec defers that entirely** and does **not** touch `Timer.tsx`, `TimerEditor.tsx`,
`TimersLibrary.tsx`, or the `/timer` / `/timers` routes. The only shared file is
`client/src/App.tsx` (routing). To minimize conflict, our App.tsx edits are confined to:
removing the Today/Month routes, fixing the landing route, and the habit route shuffle
(Section 3) — leaving all `/timer*` and `/timers*` lines untouched. Merge order is expected
to be: their branch lands, then this branch rebases on top and resolves App.tsx by keeping
both route sets. Their design also explicitly leaves `FocusRun`/`ActiveRun`/`MiniPlayer` and
the hooks/API/schema as non-goals, so our Section 2/4 changes do not collide with their code.

In their world a **Focus block is a saved-timer preset** launched into the normal
`ActiveRun`. Our tagging (Section 2) then attributes that running block to a habit — the two
compose cleanly.

---

## Section 1 — Navigation slim-down

- `client/src/features/Layout.tsx`: remove **Today** and **Month** from the desktop sidebar
  and the mobile bottom bar. Resulting order: Week · Habits · Timer · Progress · Settings.
- `client/src/App.tsx`:
  - `/` → render Week (replace the TodayView landing). Implement as
    `<Route path="/" element={<Navigate to="/week" replace />} />` (or render `WeekBoard`
    directly); `*` → `/` as today.
  - Remove the `/month` route and the TodayView route.
  - Leave `/timer`, `/timers*`, `/focus`, `/quick` redirects to the timer-page effort.
- Delete `client/src/features/tasks/TodayView.tsx` and
  `client/src/features/tasks/MonthCalendar.tsx`.
- **Relocate Today's stat pills.** Today's header showed: current streak, today's session
  count, today's minutes. Move these into the **Week header** as compact pills (reuse
  `todaySummary`/`currentStreak` from `lib/stats`). The rest/vacation toggles do **not**
  move here — they move to the drill-down (Section 4).
- Today's tasks + gcal events need no migration: `WeekBoard` already renders both per day.

## Section 2 — One shared run + habit tagging (remove the umbrella)

**Goal:** a single running timer, attributable to a habit, with the old background-focus
umbrella deleted.

### State (`client/src/features/run/RunContext.tsx`)
- Collapse the two slots (`focus` + `foreground`) into **one** run slot.
- Remove: `FocusSlot`, the `focus` state, `startFocus`, `focusActive`, `closeFocus`, and the
  `<FocusRun/>` render.
- The run slot gains a mutable **`taggedHabitId: string | null`**.
- Context surface becomes:
  - `startRun(spec)` — unchanged entry; a fresh run starts with `taggedHabitId =
    spec.habitId ?? null` (a habit timer is pre-tagged; a focus block starts untagged).
  - `setTag(habitId: string | null)` — re-tag the *current* run without restarting it.
  - `activeRun: { label, taggedHabitId, running } | null` — read model for the UI.
- Rehydrate-on-mount logic keeps the single-slot resume (drop the focus-slot rehydrate).

### Persistence (`client/src/features/run/activeRunStore.ts`)
- `PersistedRun.parentFocusId` → **`taggedHabitId`** (persist the tag so a reload keeps
  attribution). Single `'foreground'` key remains; remove the `'focus'` key usage.

### Run engine (`client/src/features/run/ActiveRun.tsx`)
- Replace the `parentFocusId` prop with `taggedHabitId` (driven by context so a mid-run
  re-tag is reflected). In `logRun`, attribute `habitId = taggedHabitId ?? spec.habitId ??
  null`. Focus blocks (`trackMode === 'focus'`) keep work-only time accounting; the only
  change is they now log to the tagged habit instead of `null`.
- `RunScreen` / `MiniPlayer`: show the tagged habit's name (e.g. "▸ Meditate") and allow
  clearing the tag. (Minimal: a small label + an "untag" affordance.)

### Habits dashboard (`client/src/features/dashboard/Dashboard.tsx`)
- When `activeRun` is running: show a **"Focus running · tap a habit to count it toward
  one"** banner. Tapping a habit calls `setTag(habit.id)` (and the card shows a tagged
  state) instead of `start()`.
- When no run is active: tapping a habit duration starts that habit's timer exactly as today.
- Replace the `<FocusStarter/>` umbrella button with a lightweight **"Start focus"** that
  calls `startRun(<default pomodoro spec>)` (no separate slot). The clock-icon `/timers`
  link is left as-is (the timer-page effort redirects it).

### Deletions
- `client/src/features/run/FocusRun.tsx`, `FocusBar.tsx`, `FocusStarter.tsx` (umbrella).
- Any `parentFocusId` / focus-umbrella references (`lib/types`, session logging) migrate to
  the `taggedHabitId` model; the `Session.parentSessionId` field is set from the tag if it
  exists, else null (kept for backward-compatible session shape).

**Out of scope (v1):** per-work-phase tagging (one block → one tagged habit, last tag wins).

## Section 3 — Per-habit drill-down page

- **Routes** (`client/src/App.tsx`):
  - `/habits/:id` → **`HabitDetail`** (new) — the drill-down.
  - `/habits/:id/edit` → `HabitEditor` (moved from `/habits/:id`).
  - `/habits/new` → `HabitEditor` (unchanged).
- `HabitCard`: clicking the card *body* navigates to `/habits/:id`; the existing edit
  affordance points to `/habits/:id/edit`. Duration buttons keep starting/tagging (Section 2).
- **`HabitDetail`** (`client/src/features/habits/HabitDetail.tsx`): header (habit name +
  Edit button) and two tabs:
  - **Overview:** streak, average minutes/day, the per-habit **activity grid** (reuse/extract
    the existing grid added in commit `373781d`), and a recent-days list (date · minutes ·
    goal met?), driven by `useSessions` + `lib/stats`.
  - **Month:** see Section 4.

## Section 4 — Vacation/Rest range painting (Month tab) + bulk API

### UI
- The **Month** tab renders a calendar grid (`monthMatrix`, `keyToDate`, `addDaysKey`)
  showing this habit's per-day activity (dot/minutes) plus vacation (🌴) and rest (🌙)
  markers for all days.
- A **mode switch [🌴 Vacation | 🌙 Rest]**. Interaction state machine (per active mode):
  - **No pending start:** tapping an *unmarked* day sets it as the pending range start
    (highlighted). Tapping an *already-marked* day clears just that one day.
  - **Pending start set:** tapping any day commits the inclusive range from start→that day in
    the active mode (POST range), then clears the pending start. Tapping the pending-start
    day again cancels the pending selection.
  - A visible note: *"Vacation/rest days are global — they apply to every habit."*
- Month nav (prev/next) like the old MonthCalendar.

### API (`server/src/api.ts`)
- Add range endpoints (idempotent, same auth as existing per-date routes):
  - `POST /vacation-days/range` body `{ start, end }` → insert every date in `[start,end]`
    (`onConflictDoNothing`).
  - `DELETE /vacation-days/range` body `{ start, end }` → delete every date in `[start,end]`.
  - `POST /rest-days/range`, `DELETE /rest-days/range` — identical for rest days.
  - Validation: `DATE_RE` on both bounds, `start <= end`, and a sanity cap (reject ranges
    longer than 366 days) to bound work.
- Per-date `POST/DELETE /vacation-days/:date` and `/rest-days` stay for single toggles.

### Hooks (`client/src/lib/hooks.ts`)
- Add `useSetVacationRange()` and `useSetRestRange()` mutating
  `{ start, end, on }` → POST/DELETE range, invalidating `['vacation-days']` /
  `['rest-days']`. Existing `useToggleVacationDay`/`useToggleRestDay` remain for single days.

### Semantics — "habits ask for less time" on vacation
Unchanged and already implemented: `effectiveGoal()` returns the habit's
`vacationGoalMin` (→ weekend → daily) on vacation days. This spec adds the **range** editing
surface; it does not change the goal math. (Habits with no `vacationGoalMin` set fall back to
their normal goal — configured per habit in the editor, as today.)

## Section 5 — Docs, tests, cleanup

- `README.md`: update the nav/feature list (Week · Habits · Timer · Progress · Settings),
  remove Today/Month references, remove the stale **"Quick Timer … in seconds"** bullet, and
  describe the one-timer focus + habit-tagging model and vacation/rest ranges in the habit
  drill-down. Keep timer-page wording generic so it does not contradict the unified-timer-page
  effort.
- Tests:
  - Server: cover the four range endpoints (insert/delete inclusive range, idempotency,
    `start>end` and over-cap rejection).
  - Client: tag attribution — a focus block logged while tagged attributes to the habit;
    re-tag changes attribution (extend `activeRunStore.test.ts` / a small RunContext test).
  - Remove/adjust any test or import referencing the deleted TodayView/MonthCalendar/Focus
    umbrella files. `lib/stats.test.ts`, `date.test.ts`, `calendar.test.ts` stay.
- Run `npm test` (server + client) green before finishing.

## Components affected

| File | Change |
|------|--------|
| `client/src/features/Layout.tsx` | Remove Today + Month nav entries. |
| `client/src/App.tsx` | Remove Today/Month routes; `/` → Week; habit route shuffle. Leave `/timer*`,`/timers*`. |
| `client/src/features/tasks/TodayView.tsx` | **Deleted.** |
| `client/src/features/tasks/MonthCalendar.tsx` | **Deleted.** |
| `client/src/features/tasks/WeekBoard.tsx` | Add relocated stat pills to header. |
| `client/src/features/run/RunContext.tsx` | One slot; `setTag`; remove umbrella/`startFocus`. |
| `client/src/features/run/ActiveRun.tsx` | `taggedHabitId` attribution; tag label in views. |
| `client/src/features/run/activeRunStore.ts` | `parentFocusId` → `taggedHabitId`. |
| `client/src/features/run/FocusRun.tsx`, `FocusBar.tsx`, `FocusStarter.tsx` | **Deleted.** |
| `client/src/features/dashboard/Dashboard.tsx` | Tag-on-tap when run active; "Start focus" replaces umbrella button. |
| `client/src/features/habits/HabitCard.tsx` | Card body → `/habits/:id`; edit → `/habits/:id/edit`. |
| `client/src/features/habits/HabitDetail.tsx` | **New** drill-down (Overview + Month tabs). |
| `client/src/features/habits/HabitEditor.tsx` | Reachable at `/habits/:id/edit` (no logic change). |
| `client/src/lib/hooks.ts` | Add `useSetVacationRange`, `useSetRestRange`. |
| `server/src/api.ts` | Add 4 range endpoints (vacation/rest × POST/DELETE). |
| `README.md` | Nav/feature/focus/vacation updates. |

## Risks / merge plan

- **App.tsx** is the one file shared with `feat/unified-timer-page`. Keep our edits to the
  Today/Month/habits route lines; reconcile by keeping both route sets at merge.
- Deleting the focus umbrella touches session logging (`parentSessionId`). Keep the
  `Session` field shape; only its source changes (tag vs umbrella id). Verify existing
  session/stat tests still pass.
- Removing TodayView loses its single-day rest/vacation quick-toggle; that capability now
  lives in the drill-down Month tab (range or single-day tap).
