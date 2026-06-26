# Habit Card → Tracker + Config, with a Timer→Habit Log Bridge — Design

**Date:** 2026-06-26
**Status:** Draft — pending reconciliation with parallel work (see *Relationship to other specs*)

## Problem

The habit card currently does three jobs at once, and the mix is confusing:

1. **Runs a timer** — `Start · N min` plus a duration caret (`HabitCard.tsx:128–168`).
2. **Tracks progress** — `GoalBar` (`done/goal`) + streak flame (`HabitCard.tsx:205–215`).
3. **Logs time manually** — but this is *hidden* behind a small `ListPlus` icon and a
   collapsed panel (`HabitCard.tsx:70–79`, `169–203`).

Meanwhile timing also lives on the **Timer page** (`Timer.tsx`) and as a background
**focus umbrella** (`FocusRun`). So "start a timer" exists in two mental models — inside a
habit, and on the Timer page — and the standalone timer logs to *no* habit at all. The
card tries to be a launcher, a tracker, and a logger simultaneously.

The user's framing: **a habit card should be just a tracker + configuration.** Timing
(focus blocks and/or a plain timer, optionally in parallel) belongs on the Timer page.
When you feel like it, you log an amount of time into a habit — and that should be one
easy, intuitive gesture.

## Goals

- The habit card is **tracker + config + log** only. No timer is started from a card.
- **One** way habit progress is recorded: a manual `category:'habit'` session
  (`buildManualSession`), surfaced as the card's **primary** action (not hidden).
- A **one-tap bridge**: while a timer/focus block is running, a habit's **Log** action
  pre-fills with the active timer's *uncommitted elapsed* minutes; confirm to log.
- **Lap behavior:** confirming a log resets uncommitted elapsed to 0 while the timer keeps
  running — so consecutive chunks can be logged to different habits with no double-count.
- Timers stay **habit-agnostic**: a running timer never needs to know about habits.

## Non-goals

- No schema or `/api/sessions` changes. `sessions` already supports manual `habitId` logs.
- No new timer types, and no changes to the run/playback engine internals
  (`ActiveRun`, `FocusRun`, `MiniPlayer`, `useTimerEngine`) beyond exposing a read-only
  elapsed value + a checkpoint reset (see *The seam* below).
- No redesign of the Timer page layout — that is owned by the
  **unified-timer-page** spec (see below). This spec only *consumes* the Timer page as the
  single home for timing.
- No change to abstinence (`kind:'abstain'`) habits — they keep their stayed-off toggle.

## Relationship to other specs (reconciliation)

This is the **habits-side half** of a two-part decoupling. The companion is
[`2026-06-26-unified-timer-page-design.md`](./2026-06-26-unified-timer-page-design.md),
the **timer-page half**, which makes saved timers the centerpiece and consolidates the
builders/editor. They share one thesis: **you launch and measure time on the Timer page;
habits only track and get logged into.** They are complementary, not competing:

- The unified-timer-page spec lists habits as untouched / out of scope — this spec fills
  that gap from the other side.
- The unified-timer-page spec's non-goal "no changes to the run/playback experience" is
  preserved here: the only run-layer change is an *additive*, read-only elapsed accessor
  plus a checkpoint reset on `RunContext` — no change to how runs play, pause, or log.

**The one shared seam to reconcile** with parallel agents: the active timer's
**uncommitted elapsed** value that the habit Log reads from. If another agent is also
touching `RunContext`/`activeRunStore`, that accessor must be defined once and shared.
This spec defines it minimally (below); align names/shape if a parallel design differs.

## Design

### 1. Habit card becomes tracker + config + log

`HabitCard.tsx` (time habits, `kind !== 'abstain'`):

- **Remove** the `Start · N min` button, the duration caret, and the expanded length
  picker (`HabitCard.tsx:128–168`). The `onStart` prop is removed from the card.
- **Keep** `GoalBar` (`done/goal`), the streak flame, the edit pencil, hide-for-today, and
  the card's group/section placement — all unchanged.
- **Promote logging to the primary action.** The currently-hidden `onLog` panel
  (`HabitCard.tsx:169–203`) becomes the card's main affordance: a clear **Log** control in
  the body (where Start used to be), opening the same minute chips + custom-minute input
  that already exist. No new logging UI is invented — it is the existing panel, surfaced.
- **Abstinence habits** are untouched: they still render only the stayed-off toggle +
  clean-day streak (`HabitCard.tsx:99–122`).

Config: the `durations[]` / `defaultDurationMin` fields no longer drive a Start button.
They still seed the quick-pick minute chips in the Log panel (handy presets), so they
remain meaningful in the editor. (If a parallel timer-side design retires them entirely,
the Log panel falls back to the custom-minute input + a small default set.)

### 2. The Log bridge (the "simple and intuitive" core)

The Log action behaves the same whether or not a timer is running — one code path, with an
optional pre-fill:

- **A timer/focus block is running:** the custom-minute input is **pre-filled** with the
  active timer's *uncommitted elapsed* (rounded to minutes), editable. Confirm → calls the
  existing `onLog(habit, min)` → `buildManualSession` → `category:'habit'` session, then
  **checkpoints** the run (resets uncommitted elapsed to 0; the timer keeps running).
- **No timer running:** identical, just no pre-fill — you type the minutes. This is exactly
  today's manual-log behavior, now front-and-center.

This realizes "start a timer or whatever, and when you feel like it, log the amount": the
timer accumulates uncommitted minutes; tapping Log on a habit attributes that chunk and
resets the lap, ready for the next stretch.

Quick-pick chips (e.g. `5m`, `25m`) still log a fixed amount directly and also checkpoint
the run, so a fixed-size log behaves consistently with a pre-filled one.

### 3. The seam — uncommitted elapsed on `RunContext`

`RunContext` today exposes `startRun`, `startFocus`, `focusActive` (`RunContext.tsx:11–17`)
but no live elapsed. Add a small, read-only surface:

- `activeElapsedSec(): number` — the uncommitted elapsed of the most relevant active run.
  Resolution order: **foreground run** (`ActiveRun`) if present, else the **focus umbrella**
  (`FocusRun`), else `0`. Derived from the existing wall-clock model
  (`startedAtEpoch` + `resumeElapsed`, cf. `liveElapsedMs` in `activeRunStore`) minus a
  per-run **checkpoint baseline**, so it reports *uncommitted* time, not total.
- `checkpointActive(): void` — sets the active run's checkpoint baseline to its current
  elapsed (the lap reset). Persisted alongside the run snapshot in `activeRunStore` so it
  survives reload, consistent with how runs already rehydrate (`RunContext.tsx:34–48`).

These are additive: playback, pause/skip, completion logging, and the focus umbrella's own
`category:'focus'` stat session are all unchanged. The focus umbrella keeps recording total
focus time for focus stats; habit logs are orthogonal `category:'habit'` sessions already
excluded from focus double-counting.

### 4. Data flow (unchanged plumbing)

- Recording habit progress: **only** via `onLog → buildManualSession → POST /api/sessions`
  (`sessionLog.ts`, `offlineQueue.ts`), offline-queued exactly as today.
- Launching/measuring time: **only** on the Timer page (`startRun` / `startFocus`),
  habit-agnostic. The dead `RunSpec.habitId` path that previously originated from card
  Start is retired (cards no longer call `startRun`).
- The card's Log reads `activeElapsedSec()` for the pre-fill and calls `checkpointActive()`
  on confirm.

## Components affected

| File | Change |
|------|--------|
| `client/src/features/habits/HabitCard.tsx` | Remove Start button + caret + length picker + `onStart`. Promote the existing `onLog` panel to the card's primary action. Pre-fill the minute input from `activeElapsedSec()` when a run is active; call `checkpointActive()` on confirm. Abstain branch unchanged. |
| `client/src/features/dashboard/Dashboard.tsx` | Stop passing `onStart`/`start`; the bottom-bar **Timer** and **+ Habit** buttons stay. Wire the card Log to read elapsed + checkpoint via `useRun()`. |
| `client/src/features/run/RunContext.tsx` | Add read-only `activeElapsedSec()` and `checkpointActive()`; track a per-run checkpoint baseline. |
| `client/src/features/run/activeRunStore.ts` | Persist the checkpoint baseline in the run snapshot so the lap survives reload. |
| `client/src/features/habits/*` (Habits page) | Same card prop changes propagate (the card is shared). |

Reused without change: `buildManualSession`, `logSession`/`offlineQueue`, `GoalBar`,
`todaySummary`/`effectiveGoal`/`goalStreak`, `ActiveRun`/`FocusRun` engines, the
`category:'focus'` exclusion in daily totals.

## Error / edge handling

- **No active run:** `activeElapsedSec()` returns `0`; Log opens with an empty input
  (pure manual entry). No pre-fill, no checkpoint side effect until a positive log.
- **Both focus + foreground active:** foreground wins for the pre-fill, matching the user's
  immediate attention; `checkpointActive()` resets that same run.
- **Rounding:** uncommitted seconds round to whole minutes for the pre-fill; the logged
  value is whatever the user confirms (`min > 0`, finite — existing guard at
  `HabitCard.tsx:51–56`).
- **Reload mid-lap:** checkpoint baseline rehydrates with the run snapshot, so uncommitted
  elapsed continues from the last log, not from the run's absolute start.
- **Abstain habits:** never show Log; unaffected.

## Testing

- Unit: `activeRunStore` round-trips the new checkpoint baseline; `activeElapsedSec()`
  resolution order (foreground > focus > 0) and the post-checkpoint reset.
- Existing suite (`activeRunStore.test.ts`, agent tests) runs green — additive change.
- Manual (local dev per the run recipe):
  - Habit card shows no Start button; Log is the primary action; progress + streak intact.
  - With no timer: Log a typed amount → habit progress increases.
  - Start a Timer-page timer → wait → Log on a habit pre-fills ~elapsed → confirm logs that
    amount; the timer keeps running and its uncommitted elapsed resets to 0.
  - Log a second habit after another stretch → only the new stretch is logged (no
    double-count).
  - Reload mid-lap → uncommitted elapsed resumes from the last log.
  - Abstain habit still shows only the stayed-off toggle.
