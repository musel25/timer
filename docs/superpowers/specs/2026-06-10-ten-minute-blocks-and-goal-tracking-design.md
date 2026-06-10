# Ten-minute blocks & goal-based tracking — Design

## Problem

Each habit currently offers a row of duration chips (default `[5, 10, 15, 20]`
minutes) plus per-habit timer-type options — too many choices for what should be
a one-tap action. Tracking is also confusing:

- The Progress page bar is **relative ranking**: `width = habitMinutesThisWeek /
  maxMinutesOfAnyHabitThisWeek`. The most-active habit is always a full bar, so
  100% doesn't mean anything was "achieved."
- `dailyGoalMin` is user-set in the editor but only rendered as a text label —
  it never drives any bar.
- Focus sessions (Pomodoro / Focus block from the Timer page) are logged with
  `habitId: null` and a generic label; they vanish from per-habit tracking and
  carry no work/study distinction.

## Decisions (from brainstorming)

- **One button per habit: "Start · 10 min".** Duration chips, the durations
  editor, default-duration picker, and the interval/preset-timer option for
  habits all go away. Every habit runs the same simple 10-minute timer.
- **Continue by prompt.** When a block completes (normal completion sound), the
  finish screen offers **"+10 more"** and **"Done"**. Each block logs its own
  session, so chained blocks each count and quitting mid-block never loses
  credit for finished ones.
- **Goal = N blocks/day, segmented bar.** The habit's daily goal is expressed in
  10-minute blocks. Bars fill per completed block **today**; 100% = goal met.
- **Focus sessions tagged Work or Study, tracked in minutes only.** Picked at
  start on the Timer page; Progress gets a Focus section with today/week minutes
  per tag. No goals for focus — session lengths vary, totals are honest.

## Approach

### Data model — no schema change

- The goal stays in the existing `dailyGoalMin` column. The editor stepper
  becomes **"Daily goal (blocks)"** (0 = none, 1–12) and saves `blocks * 10`.
  Existing goals display as `Math.round(dailyGoalMin / 10)`.
- `durations`, `defaultDurationMin`, `timerType`, `defaultTimerId` stay in the
  schema but the UI no longer reads them. New habits are created with
  `durations: [10]`, `defaultDurationMin: 10`, `timerType: 'simple'`. No
  migration; old sessions keep counting toward stats.
- The Work/Study tag is stored in the existing `sessions.label` field (`'Work'`
  or `'Study'`). Older focus sessions keep their old labels and group under an
  "Other focus" row when nonzero.

### Block counting

`blocksToday(habitId) = floor(completedMinutesToday / 10)`, summing
`actualSeconds` of today's completed sessions for that habit. Minutes-based (not
session-count-based) so legacy 5/15/20-minute sessions still convert sensibly.

## Pieces

### 1. HabitCard — `client/src/features/habits/HabitCard.tsx`
- Replace the duration-chip row with a single **"Start · 10 min"** button →
  `onStart(habit, 10)`.
- Below it, a segmented progress bar: `goalBlocks` segments, filled =
  `min(blocksToday, goalBlocks)`, label `"{blocksToday}/{goalBlocks}"` (can
  exceed, e.g. `4/3`). No goal → muted text `"{blocksToday} blocks today"`
  (hide when 0).
- The `doneChips` (`habitId:plannedMinutes`) mechanism is replaced by the
  block count.

### 2. HabitEditor — `client/src/features/habits/HabitEditor.tsx`
- Remove: durations stepper, default-duration picker, timer-type / preset-timer
  selection.
- Goal stepper becomes "Daily goal (blocks)", 0–12 step 1, suffix "× 10 min";
  loads as `round(dailyGoalMin / 10)`, saves as `blocks * 10` (`null` when 0).

### 3. Run completion — `client/src/features/run/ActiveRun.tsx` / `RunScreen.tsx`
- When a run with a `habitId` completes, the finish screen shows **"+10 more"**
  (primary) and **"Done"**. "+10 more" logs the finished block as usual and
  immediately starts a fresh identical 10-minute run for the same habit.
- Non-habit runs (focus, interval) keep the current finish screen.

### 4. Timer page Work/Study tag — `client/src/features/timer/Timer.tsx`
- Pomodoro and Focus-block modes get a two-option **Work / Study** toggle.
  Default = last used, remembered in `localStorage` (`timer_focus_tag`).
- The started run's session `label` is set to the tag. Interval mode is
  untouched (workouts, no tag).

### 5. Progress page — `client/src/features/stats/Progress.tsx`, `client/src/lib/stats.ts`
- **Habits list**: per-habit row becomes the segmented blocks-today-vs-goal bar
  (same component as HabitCard), with weekly minutes kept as a secondary label.
  The relative-ranking width formula is removed.
- **Per-habit streak** = consecutive days the goal was met; for habits without
  a goal, consecutive days with ≥1 block.
- **Overall streak card** stays "consecutive days with at least one completed
  session" — existing streaks survive.
- Add a **"Today: N blocks · M min"** summary line (habit sessions only).
- New **Focus section**: rows for Work and Study (and "Other focus" if legacy
  untagged minutes exist in the window) showing `{week}m this week · {today}m
  today`, with a simple bar scaled relative within the section.
- Week / 30-day stat cards unchanged (they already include focus minutes).

### 6. Stats helpers — `client/src/lib/stats.ts`
- Add `blocksTodayByHabit(sessions)`, goal-aware per-habit streak, and a
  focus-minutes-by-label helper (sessions with `habitId === null`, bucketed
  into `Work` / `Study` / other).

## Testing

- **Unit** (stats helpers): block counting from mixed-duration legacy sessions;
  goal-met streak vs ≥1-block streak; focus bucketing of tagged + legacy labels.
- **Manual**: start habit → single 10-min button; finish → "+10 more" chains a
  second block and both log; bar shows `2/3` after two blocks of a 3-block goal;
  editor round-trips a goal of 3 blocks as `dailyGoalMin = 30`; Timer page
  remembers last Work/Study choice; Progress shows the Focus section split.

## Out of scope

- Removing the deprecated habit columns (`durations`, `timerType`, …) from the
  schema.
- Goals/blocks for focus sessions.
- Auto-continue (rolling into the next block without a prompt).
- Per-task time tracking — tasks remain checkbox-only.
