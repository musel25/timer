# Per-habit grids, completion auto-hide, time sorting, and tiered (weekend/vacation) goals

Date: 2026-06-24
Status: Approved (design)

Four related improvements to how habits are displayed and how their streaks
are computed. They are cohesive but staged: the goal-model / streak-engine
change (Feature 4) is the foundation that Features 1, 2, and the goal display
all build on, so it is implemented first.

## Motivation

- The Progress page only shows one combined activity heatmap; the user wants to
  see each habit's day-by-day history individually.
- Completed habits clutter the Today dashboard; once done for the day they
  should get out of the way.
- Habit order on the dashboard is arbitrary (`sortOrder`); sorting shortest-first
  makes the quick wins surface first.
- Weekends and vacations should not break a streak, but the current mechanism
  makes weekends *transparent* (they do not count at all). The user instead
  wants to still do a **lighter** version on those days and have it keep the
  streak — configurable per habit.

## Feature 4 — Tiered goals (weekday / weekend / vacation)  *(foundation)*

### Model

Every habit is tracked **every day**, regardless of group. The lighter
weekend/vacation goal is **opt-in per habit**:

| Day type      | Effective goal                                  |
|---------------|--------------------------------------------------|
| Vacation day  | `vacationGoalMin` if set, else weekend goal, else weekday goal |
| Weekend (Sat/Sun) | `weekendGoalMin` if set, else weekday goal   |
| Weekday       | `dailyGoalMin` (existing)                        |

`weekendGoalMin` / `vacationGoalMin` are **nullable**. Null means "no reduction
— use the normal goal that day." There is no automatic 5-minute default applied
to every habit; 5 is merely a value the user might type. A habit with no
weekend goal behaves on weekends exactly as on weekdays.

Abstain habits are unaffected (they are binary "stayed off"); weekend/vacation
goals apply only to time habits.

### Day-type concepts (most specific wins)

- **Rest day** (`rest_days`, existing): fully transparent — never counts, never
  breaks the streak. Unchanged.
- **Vacation day** (`vacation_days`, new): NOT transparent — the day still
  requires the (lighter) vacation goal to keep the streak.
- **Weekend**: derived from day-of-week; requires the weekend goal.

### Data model

- `habits.weekend_goal_min INTEGER` (nullable), `habits.vacation_goal_min INTEGER`
  (nullable) — added via `addColumnIfMissing` in `server/src/db.ts`, mirrored in
  `server/src/schema.ts` and `client/src/lib/types.ts` (`weekendGoalMin`,
  `vacationGoalMin: number | null`).
- New `vacation_days` table mirroring `rest_days` exactly (`id`, `user_id`,
  `date`, `created_at`; unique index on `(user_id, date)`).
- `GET / POST / DELETE /vacation-days` in `server/src/api.ts`, copied from the
  rest-days routes. **Must register `api.use('/vacation-days', requireAuth)` and
  `api.use('/vacation-days/*', requireAuth)`** — server auth is opt-in per route
  prefix, so a new route is public until `requireAuth` is wired up.
- `client/src/lib/hooks.ts`: `useVacationDays` + `useToggleVacationDay`,
  mirroring `useRestDays` / `useToggleRestDay`. New `VacationDay` type
  (shape identical to `RestDay`).

### Streak engine (`client/src/lib/stats.ts`)

- New helper `effectiveGoal(habit, ts, vacationDays): number | null` implementing
  the table above. It returns the **explicitly configured** goal for that day's
  tier, or `null` when none is configured — it does NOT apply the 10-minute
  no-goal fallback (that stays inside `goalStreak`, so it does not leak into the
  completion/auto-hide check below).
- Rewrite `goalStreak` to take the `habit` plus `restDays` and `vacationDays`
  sets, computing `need = effectiveGoal(...) ?? 10` per day (the `?? 10`
  preserves the existing "no goal → any 10-minute day" streak behavior) instead
  of a single fixed value. `skip(ts)` is now **only** `restDays.has(dayKey(ts))`. Vacation days are
  not skipped. The `weekdaysOnly` weekend-skip is removed.
- `habitStreak(habit, sessions, restDays, vacationDays)`: abstain → unchanged
  `currentStreak` (rest days transparent); time → new `goalStreak`. The
  `weekdaysOnly` parameter is dropped.
- Update callers: `Dashboard.tsx`, `Progress.tsx`, `TodayView.tsx` pass
  `vacationDays` and drop the `weekdaysOnly` argument.

### Retiring `weekdaysOnly`

`weekdaysOnly` is removed from streak math (every day now counts). The column is
left dormant in the DB; its toggle is removed from the group editor UI if
present. No backfill is needed — the user opts specific habits into a lighter
weekend goal as desired (e.g. the former "Work" habits).

### UI

- `HabitEditor`: two new optional number inputs — **Weekend goal** and
  **Vacation goal** — shown for time habits, with placeholders indicating that
  empty = "same as daily goal" (vacation placeholder = weekend goal).
- **"Vacation" pill** in the Today header (`TodayView.tsx`) next to the existing
  "Rest day" pill: toggle today + a "mark yesterday" affordance, using
  `useToggleVacationDay`. Distinct icon (e.g. `Palmtree`/`Plane`).

### Goal display ("the weekend visual change")

The `GoalBar` shown on each Dashboard `HabitCard` and each Progress per-habit
card uses **today's effective goal**, not the raw `dailyGoalMin`. So on a
weekend a habit with a 5-min weekend goal reads "X / 5 min" and fills at 5.
Dashboard computes the effective goal per habit (using today's date + vacation
set) and passes it as the `goal`/`minutesToday` basis to `HabitCard`.

## Feature 1 — Per-habit grids on the Progress page

- New stats helper `habitHeatmap(sessions, days, habitId): { date, minutes, done }[]`
  (oldest-first, `days = 18 * 7 = 126`), where `minutes` is that habit's minutes
  that day and `done` is true when any completed session for the habit exists
  that day.
- New presentational component `HabitGrid` (7-row column grid, same layout as
  the existing "Minutes / day" graph in `Progress.tsx`), placed inside each card
  in the **"By habit"** section, below the goal bar / streak.
  - Uses the habit's own category color (`categoryColor(h.id)` + `tint`).
  - **Time habit:** opacity tiers by minutes — same thresholds as the global
    grid (`<10 / <20 / <40 / >=40`).
  - **Abstain habit:** full-color square on `done` days, empty otherwise.
  - Week-aligned with the same `weekStart` lead-in blanks; `overflow-x-auto`
    because 18 weeks is wide in a two-column card.
- v1: rest days and vacation days render as ordinary squares (no special
  marker). The grid stays intensity-based; the goal-tier "visual change" lives
  in the goal bar, not the grid.

## Feature 2 — Auto-hide completed habits on the Dashboard

- Completion is **derived** (no persisted state):
  `isHabitDoneToday(habit, todaySummary, effectiveGoalToday)` where
  `effectiveGoalToday = effectiveGoal(habit, now, vacationDays)` (`number | null`):
  - abstain → `doneHabitIds.has(habit.id)`
  - time → `effectiveGoalToday != null && minutesByHabit[id] >= effectiveGoalToday`
  - time with no configured goal today (`effectiveGoalToday == null`) → never
    done, so a no-goal habit never auto-hides. With Feature 4's opt-in model this
    is consistent across days: a habit only auto-hides on a day where it actually
    has a configured goal.
- On the Dashboard, completed habits drop out of their group grids. A single
  collapsible **"✓ N completed today — show"** strip at the bottom reveals them
  (dimmed). Un-completing (deleting the session / un-marking abstain) returns
  the card to its group automatically.

## Feature 3 — Sort habits by time on the Dashboard

- Within each group and the "Other" list, sort time habits by default duration
  ascending: `defaultDurationMin ?? durations[0] ?? Infinity`. Abstain habits
  (no duration) sort to the end, `name` as tiebreak.
- Replaces the current `sortOrder` sort in `Dashboard.tsx`. The Progress page
  keeps its existing "most minutes this week" ranking.

## Testing

- `stats.test.ts`:
  - `effectiveGoal` — weekday vs weekend (opted-in and not) vs vacation, with
    vacation falling back to weekend then weekday.
  - `goalStreak` with tiered goals — a light weekend day at/above its weekend
    goal keeps the streak; below it breaks; a vacation day requires its goal;
    rest days remain transparent.
  - `habitHeatmap` — correct per-habit minutes/`done` and date window.
  - `isHabitDoneToday` — goal met, abstain marked, no-effective-goal never.
  - sort-by-time ordering of a mixed list (durations + abstain).
- `server`: `vacation_days` CRUD + idempotency test mirroring
  `restDays.test.ts`; confirm `/vacation-days` requires auth.

## Implementation order

1. **Feature 4 foundation** — schema/db columns + `vacation_days` table + API
   (with `requireAuth`) + types + hooks + `effectiveGoal`/`goalStreak`/
   `habitStreak` rewrite + caller updates + tests.
2. **Goal display** — `GoalBar` uses today's effective goal (Dashboard +
   Progress).
3. **Feature 1** — `habitHeatmap` + `HabitGrid` on Progress.
4. **Feature 3** — sort-by-time on Dashboard.
5. **Feature 2** — `isHabitDoneToday` + completed-today strip on Dashboard.
6. **Feature 4 UI** — `HabitEditor` weekend/vacation inputs + Vacation pill in
   the Today header.

## Out of scope

- Drag-and-drop habit ordering (deferred; sort-by-time chosen instead).
- Vacation date *ranges* (per-day toggle chosen instead).
- Special grid markers for rest/vacation days.
- Global (non-per-habit) goal defaults.
