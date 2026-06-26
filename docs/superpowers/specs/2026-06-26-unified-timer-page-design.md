# Unified Timer Page — Design

**Date:** 2026-06-26
**Status:** Approved, ready for implementation plan

## Problem

Saved timers are hard to reach and the timer section is confusingly split:

- **`/timer`** (the "Timer" nav tab) is a *builder*: Focus-block / Timer sub-tabs, with
  saved timers crammed in as tiny **preset chips** at the top.
- **`/timers`** is a polished card *library* of saved timers — but it is **not linked
  anywhere in the navigation**. It is only reachable by typing the URL, so it is
  effectively orphaned.
- Building a timer happens in **two** overlapping places: the inline builders in
  `Timer.tsx` (simple + pomodoro) and `TimerEditor.tsx` (simple + interval). "Simple"
  exists in both; "pomodoro" only inline; "interval" only in the editor.

The user's primary action is **launching a saved timer**, yet that is the least
prominent thing on the page. Goal: make saved timers the centerpiece and one tap from
start, and collapse the split into one clear page plus one editor.

## Goals

- Saved timers are the first thing on `/timer`, shown as a prominent one-tap launch grid.
- Keep a lightweight **quick start** for ad-hoc, unsaved timers.
- Exactly **one** place to build/edit (all three types), and **one** place to launch.
- No orphaned routes; navigation unchanged ("Timer" already points at `/timer`).

## Non-goals

- No changes to the run/playback experience (FocusRun, ActiveRun, MiniPlayer, etc.).
- No changes to the timer data model, the `/timers` API, or React Query hooks.
- No changes to how timers are launched internally (`runSpecFromPreset` already converts
  any of the three preset types into a runnable `RunSpec`).
- No new timer types.

## Timer types (context)

Three `TimerPreset` types exist and all already launch via `runSpecFromPreset`:

- **simple** — plain countdown (e.g. "25 min").
- **pomodoro** — "Focus block": multi-round work/break cycles. Today edited inline on `/timer`.
- **interval** — HIIT-style work/rest sets. Today edited only via `TimerEditor`.

## Design

### The unified `/timer` page

A single page component renders, top to bottom:

```
Timer
Run a saved timer, or start a quick one

── Quick start ─────────────────────────────
 [ −   15 min   + ]      [ ▶ Start ]   [ Save ]

── Saved timers ───────────────────────  [ + New ]
 ┌───────────────────┐  ┌───────────────────┐
 │ Deep Work       ▶ │  │ Quick 25        ▶ │
 │ ⓕ 4×25m/5m · ~2h  │  │ ⏱ 25 min          │
 │ edit · dup · del  │  │ edit · dup · del  │
 └───────────────────┘  └───────────────────┘
 ┌───────────────────┐
 │ HIIT            ▶ │   ⚡ interval · 8×(40s/20s)
 └───────────────────┘
```

**Quick start (top, compact):**
- A minutes stepper + **Start** button starts an ad-hoc `simple` timer immediately
  (no save), reusing the existing `SimpleTimerBuilder` start logic
  (`startRun({ type: 'simple', ... })`).
- A **Save** button promotes the current minutes into a saved `simple` preset
  (existing `useSaveTimer` flow), after which it appears in the grid below.
- This is the only ad-hoc builder on the main view; it is intentionally minimal.

**Saved timers (centerpiece):**
- A responsive card grid (reuse `TimersLibrary`'s card layout and styling —
  `grid gap-3 sm:grid-cols-2 xl:grid-cols-3`, `.card`).
- All three types are shown together. Each card shows name, a small **type
  badge/icon** (focus / timer / interval), the `describePreset` summary, and
  `humanDuration(presetSeconds)`.
- **Tapping the card body OR the ▶ launches it instantly** via
  `startRun(runSpecFromPreset(t))`. (Today only the small ▶ button starts it; the whole
  card becomes the hit target.)
- Each card keeps lightweight actions: **edit** (opens the editor pre-filled),
  **duplicate** (existing `save.mutate({ name: \`${t.name} copy\`, ... })`),
  **delete** (existing `del.mutate(t.id)`).
- Empty state: a friendly "No saved timers yet — create one with + New" message.
- `+ New` opens the editor for a fresh timer.

### One editor for all three types

`TimerEditor` (`/timers/new`, `/timers/:id`) becomes the single build/edit surface and
gains **Focus block (pomodoro)** support alongside its existing simple + interval modes:

- Type toggle: **Focus block** / **Timer** / **Interval**.
  (Note: today's editor mislabels the `simple` type as "Focus block"; that label moves
  to the real pomodoro type, and `simple` is labeled "Timer".)
- Focus-block mode uses the same pomodoro controls currently in `Timer.tsx`'s
  `FocusBlockBuilder` (work / short / long / longEvery / rounds steppers + the round/break
  preview strip), saving a `pomodoro` preset.
- Save and Delete continue to navigate back to the timer page.
- The inline pomodoro editing in `Timer.tsx` is removed (it now lives here), so the
  `existing.type === 'pomodoro'` early-return guard in `TimerEditor` is dropped.

### Routing & cleanup

- `/timer` → the new unified page component.
- `/timers` → **redirect** to `/timer` (no dead URL; the orphaned `TimersLibrary` page is
  removed, its card UI absorbed into the unified page).
- `/timers/new` and `/timers/:id` → `TimerEditor` (now all-types). These paths are kept
  as-is to minimize churn; the editor navigates back to `/timer` on save/delete.
- `Timer.tsx`'s preset chips, Focus/Timer mode tabs, and inline builders are removed.
- Navigation (`Layout.tsx`) is unchanged — "Timer" already routes to `/timer`.

## Components affected

| File | Change |
|------|--------|
| `client/src/features/timer/Timer.tsx` | Rewritten into the unified page: quick-start row + saved-timers grid. Inline builders, chips, and mode tabs removed. |
| `client/src/features/timers/TimersLibrary.tsx` | Removed (card UI moves into the unified page). |
| `client/src/features/timers/TimerEditor.tsx` | Gains Focus-block (pomodoro) mode; type labels corrected; pomodoro guard removed. |
| `client/src/App.tsx` | `/timers` redirects to `/timer`; `TimersLibrary` import removed. |
| `client/src/lib/presets.ts` | Unchanged (already converts all preset types to run specs). |
| `client/src/features/Layout.tsx` | Unchanged. |

Reused without change: `useTimers`, `useSaveTimer`, `useDeleteTimer`, `runSpecFromPreset`,
`describePreset`, `presetSeconds`, `humanDuration`, `buildPomodoroPhases`, `Stepper`, `.card`/`.chip`/`.btn-*` styles.

## Data flow

Unchanged. The page reads `useTimers()`, launches via `startRun(runSpecFromPreset(t))`,
and mutates via the existing save/delete hooks, which invalidate `['timers']`. Quick-start
runs a `simple` spec directly and optionally saves it as a `simple` preset.

## Error / edge handling

- **Empty library:** show the empty state; quick-start still works.
- **Quick-start Save naming:** name as `\`${minutes} min\`` (matches current `SimpleTimerBuilder`).
- **Card start vs. action click:** the edit/duplicate/delete controls must stop event
  propagation so clicking them does not also launch the timer.
- **Pomodoro in editor:** a pomodoro preset opened via `edit` loads its `PomodoroConfig`
  into the Focus-block controls; saving writes back to the same id.

## Testing

- Existing tests (`activeRunStore.test.ts`, agent tests) are unaffected; run the suite to
  confirm no regression.
- Manual verification (local dev per the run recipe):
  - `/timer` shows quick-start + saved-timers grid; tapping a card launches it.
  - Quick-start Start runs an ad-hoc timer; Save adds it to the grid.
  - `+ New` → editor creates each of the three types; they appear in the grid and launch.
  - Editing a card (each type, incl. focus block) round-trips correctly.
  - Duplicate / delete work from the cards.
  - Visiting `/timers` redirects to `/timer`.
```
