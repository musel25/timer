# Nested focus sessions + persistent active runs

**Date:** 2026-06-17
**Status:** Superseded — nested focus sessions and the focus-session "umbrella"
were removed. There is now a single timer run with no habit attribution; habits
are logged by hand. Kept for historical context only.

## Problem

Today the app runs exactly one timer at a time: `RunContext` holds a single
`RunSpec` and `ActiveRun` mounts one engine above the router. Two consequences:

1. **No concurrency.** Starting a habit while a focus block is running *replaces*
   it — you can't run a long focus session with short habit timers inside it.
2. **No persistence.** A running timer lives only in React memory + engine refs.
   A page reload (or tab close/reopen) loses it; only *completed* sessions are
   persisted to SQLite.

## Decisions (from the user)

- **Umbrella + sub-timers.** One long *focus session* runs as a background
  countdown. Habit timers run "inside" it in the foreground; the focus bar keeps
  counting underneath. Habit minutes log to the habit **and** the focus block
  coherently contains them.
- **Resume live.** On reload a running timer resumes as if it never stopped,
  accounting for wall-clock time elapsed while away.
- **Log focus separately.** The focus session is logged as its own session
  (`category='focus'`) so total focus time is visible in stats, distinct from the
  habit sub-sessions, with **no double-counting** in daily totals.

## Key simplification

The user runs habits *sequentially* inside one focus block, so we need **at most
two concurrent engines**: one background `focus` + one foreground timer — not an
arbitrary stack.

## Design

### 1. Two-slot run model (`RunContext`)

`RunContext` gains two slots instead of one:

- `focus` — the umbrella: a long simple countdown that survives navigation/reload
  and runs in the background. Identified by a stable `focusId`.
- `foreground` — a habit/ad-hoc timer, exactly as today. Foreground timers still
  replace each other; they no longer clobber the focus session underneath.

New context API: `startFocus(minutes)`, `stopFocus()`, plus existing `startRun()`.
Each slot renders a child component owning its own `useTimerEngine`.

When a focus session is active, `startRun()` tags the foreground run with
`parentFocusId = focus.focusId`, so the logged session records
`parentSessionId`.

### 2. UI

- **`FocusBar`** — a slim floating pill (top-center, `z-[55]` so it shows above the
  full-screen `RunScreen` too) showing `◍ Focus · 47:12` with pause/stop, visible
  across all tabs while a focus session is active.
- **`FocusRun`** — owns the focus engine, renders `FocusBar`, logs the focus
  session on finish/stop. Focus is always a simple single-phase countdown.
- **Entry point** — a "Focus" control in the Habits dashboard header with a
  duration picker (25 / 50 / 60 / custom min).
- Foreground habits keep the existing `RunScreen` / `MiniPlayer` unchanged.

### 3. Persistence (resume live)

`activeRunStore` (localStorage) snapshots each active run as:

```
{ spec, startedAtEpoch, status: 'running'|'paused'|'done',
  elapsedMs, snapshotEpoch, focusId?, parentFocusId? }
```

Snapshots are written each displayed second and on pause/resume/start. On
`RunProvider` mount we rehydrate: compute live elapsed
(`status==='running' ? elapsedMs + (now - snapshotEpoch) : elapsedMs`), then start
the engine seeking to that offset. If a run *finished* while away, it is logged
completed on rehydrate (engine finishes immediately when the seek exceeds total).
Both focus and foreground runs persist, so starting a habit now survives reload.

Stale snapshots (started > 24h ago) are discarded.

### 4. Engine: resume support

`useTimerEngine` gains `resumeElapsedSeconds?` in `EngineOptions`. In `start()`,
when set, `seekToElapsed(phases, elapsed)` finds the phase index + remaining ms;
if the seek is past the end, the run finishes (completed) immediately. A
`workSecondsElapsed(phases, elapsed)` helper reconstructs Pomodoro completed-work
time on resume. Both helpers are pure and unit-tested.

### 5. Logging + stats

- Schema: two nullable columns on `sessions` via the existing `addColumnIfMissing`
  pattern — `category` (`'habit'` default / `'focus'`) and `parent_session_id`.
  `sessionInput` zod + insert + export/import extended.
- The focus session logs on completion/stop with `category='focus'`,
  `habitId=null`, `id=focusId`.
- Each habit run started inside a focus session logs `parentSessionId=focusId`.
- Stats: `category='focus'` is excluded from the time-totaling helpers
  (`minutesByDay`, `todaySummary` minutes/count, `minutesInRange`) so the umbrella
  never double-counts against its child habits. `focusMinutes` (habit-less
  sessions) already surfaces focus time in Progress and is left as-is.

## Scope notes

- Resume-live seek works generically across simple/interval/pomodoro phases.
  Habits and the focus umbrella are simple countdowns, so the described flow is
  exact; Pomodoro completed-work on resume is reconstructed from elapsed.
- Max two concurrent engines (one focus + one foreground), matching the
  sequential-habits-inside-one-block use case.

## Testing

TDD the bug-prone pure logic: `seekToElapsed` / `workSecondsElapsed`,
`activeRunStore` snapshot/live-elapsed math, and the stats focus-exclusion.
Then full-stack verify (typecheck, vitest, build) and a local smoke run.
