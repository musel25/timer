# Manual habit logging — design

**Date:** 2026-06-14
**Status:** Approved

## Problem

Some habits are "block"-style: you just do them, and babysitting a timer for an
exact duration doesn't fit. Today a habit only gets registered when a timer run
finishes, so doing the habit without a (completed) timer leaves it uncounted.

There is no daily goal set on habits yet — for now, simply having done the habit
(any amount of time) is what matters.

## Goal

Register a habit you did **without running a timer**: one tap when you don't care
about precision, or with custom minutes when you do.

## Design

### Entry point
A small **"Log"** control on each `HabitCard`, alongside the existing Start
controls. Activating it reveals a compact inline quick-log panel anchored to the
card. The card already renders on the Dashboard, the Habits list, and the Today
view — adding it to `HabitCard` covers all three.

### Quick-log panel
- The habit's existing duration chips (e.g. 5 / 10 / 15 / 20 / 30) — tap one to
  log that amount instantly.
- A **custom minutes** input, pre-filled with the habit's default duration, for
  arbitrary values (e.g. `120`).
- A primary **Log** button for the custom value.
- No date/time picker — always stamped *now*.

### What it writes
One `POST /api/sessions` (endpoint already exists and accepts this) with:
- `habitId`, `type: 'simple'`, `timerId: null`, `label: null`, `note: null`
- `plannedSeconds = actualSeconds = minutes × 60`
- `completed: true`
- `endedAt = now`, `startedAt = now − minutes × 60 × 1000`

A pure helper `buildManualSession(habitId, minutes, now)` produces this payload so
the math is unit-testable in isolation.

### Data flow
`HabitCard` calls an `onLog(habit, minutes)` callback. The Dashboard / Today
views supply it via a new `useLogSession()` mutation that POSTs the payload and
invalidates the `['sessions']` query, so "blocks today" and the goal bar update
immediately.

### Why no schema / stats changes
- `POST /api/sessions` already validates and inserts arbitrary sessions.
- Stats count blocks as `Math.floor(totalMinutes / 10)` over sessions with
  `completed: true`; streaks need ≥1 block/day. A manual completed session is
  indistinguishable from a timer one, so it counts identically with no changes.

## Scope (YAGNI)

In: Log button + inline panel on `HabitCard`; `buildManualSession` helper +
test; `useLogSession` mutation; wiring in Dashboard and Today views.

Out: back-fill / date override, note field on manual logs, new DB columns, any
stats changes.

## Testing

- Unit-test `buildManualSession`: correct seconds (planned == actual ==
  minutes×60), `completed: true`, and the `startedAt`/`endedAt` window.
- Manual verify: logging a block bumps "blocks today" and the goal bar on the
  card without a page reload.
- Deploy to the VPS per the standard recipe after merge.
