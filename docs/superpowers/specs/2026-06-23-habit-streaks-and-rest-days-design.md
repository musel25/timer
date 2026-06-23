# Visible per-habit streaks + "rest day" skip — Design

**Date:** 2026-06-23
**Status:** Approved (design)

## Problem

Two issues in the habits/streaks experience:

1. **Streaks are not visible per habit.** Only *abstain* habits show a flame + streak
   on their card (`HabitCard.tsx`). *Time* habits show only a goal bar / "X min today",
   so their streak is effectively hidden (it appears only on the Progress page).
   Separately, `Dashboard.tsx` passes `currentStreak(sessions, h.id)` for *all* habits,
   which is the wrong streak for time habits (they use `goalStreak`) — and is currently
   unused because the time card never renders it.

2. **No way to skip a day.** Streaks (`stats.ts`) break on any missed day. There is no
   rest-day / freeze concept. A legitimately missed day (e.g. a job interview) breaks
   every streak with no remedy. The user missed **2026-06-22** and needs it excused.

## Decisions (locked)

- **Skip scope:** whole-day, all habits. One "rest day" per date excuses every habit.
- **Streak math:** *freeze / bridge* — a rest day does **not** break the streak and does
  **not** add +1. It is transparent, exactly like a weekend under `weekdaysOnly` today.
- **Trigger UX:** a "Rest day" pill in the Today header that toggles **today**, with a
  small caret action to also mark **yesterday** (covers the retroactive case). No full
  calendar editor.

## Part A — Streaks visible on every habit card

- Add a shared helper in `client/src/lib/stats.ts`:
  ```ts
  habitStreak(habit, sessions, weekdaysOnly, restDays): number
  ```
  Returns `currentStreak(sessions, habit.id, restDays)` for `kind === 'abstain'`,
  otherwise `goalStreak(sessions, habit.id, habit.dailyGoalMin, weekdaysOnly, restDays)`.
- Use `habitStreak` in both `Dashboard.tsx` (replacing the wrong `currentStreak` call)
  and `Progress.tsx` (replacing the duplicated inline branch at `Progress.tsx:39-42`).
- In `HabitCard.tsx`, add a flame + streak footer line to the **time** branch, matching
  the existing abstain footer (`<Flame size={13} className={streak>0?'text-amber-500':''}/>`
  + `{streak}-day streak`), rendered alongside the goal bar / minutes line.

## Part B — Rest day data model

New table `rest_days`, one row per skipped date:

| column     | type                  | notes                          |
|------------|-----------------------|--------------------------------|
| id         | text PK               | `newId()`                      |
| userId     | text, not null        | owner                          |
| date       | text, not null        | 'YYYY-MM-DD' local key         |
| createdAt  | integer (ms)          |                                |

- Unique constraint on `(userId, date)`.
- Drizzle model in `server/src/schema.ts`; idempotent `CREATE TABLE IF NOT EXISTS`
  (+ unique index) migration in `server/src/db.ts`.

### API (`server/src/api.ts`), all scoped by `uid(c)`

- `GET /rest-days` → list rows for the user.
- `POST /rest-days` `{ date }` → validate `date` against `DATE_RE`; insert with
  `onConflictDoNothing` (idempotent). Returns the row.
- `DELETE /rest-days/:date` → delete by `(userId, date)`.

### Client data layer

- `RestDay` type in `client/src/lib/types.ts`.
- `useRestDays()` query (key `['rest-days']`) returning `RestDay[]`.
- `useToggleRestDay()` mutation: POST to add / DELETE to remove a date, invalidating
  `['rest-days']`.
- A small selector to build `Set<string>` of rest-day date keys for the streak helpers.

## Part C — Streak math (the freeze)

Both streak functions gain an optional `restDays: Set<string>` parameter:

- `currentStreak(sessions, habitId?, restDays = new Set())`
- `goalStreak(sessions, habitId, dailyGoalMin, weekdaysOnly = false, restDays = new Set())`

A rest day is **transparent**, reusing the existing weekend-skip mechanism:

- The backward step (`back()`) skips over rest days (and weekends, when `weekdaysOnly`).
- The starting cursor steps over a rest day on today/yesterday before evaluating.
- A rest day never counts toward the streak length and never breaks it.

Overall streaks (`TodayView.tsx` pill, `Progress.tsx` StatCard, both via
`currentStreak(sessions)`) also receive `restDays`, so a skipped day bridges them.

Result: marking **2026-06-22** as a rest day bridges the pre-interview streak to today.

## Part D — Trigger UX

In `TodayView.tsx` header, next to the streak pill, add a **"Rest day" pill**:

- Click toggles **today** (`todayKey()`) via `useToggleRestDay`.
- Active state (today is a rest day) shows a distinct "Resting today" appearance.
- A small caret/secondary control toggles **yesterday** (`addDaysKey(todayKey(), -1)`),
  labelled to reflect its current state ("Mark yesterday a rest day" / "Yesterday: resting").

## Testing

- `client/src/lib/stats.test.ts`:
  - rest day bridges `currentStreak` (no +1).
  - rest day bridges `goalStreak` (no +1), including interaction with `weekdaysOnly`.
  - rest day on today / yesterday handled by the start cursor.
  - a real gap adjacent to a rest day still breaks the streak.
- Server test (matching existing style, e.g. `hidden.test.ts`):
  - rest-days CRUD; POST is idempotent; scoped per user.

## Out of scope

- Per-habit skips (only whole-day rest days).
- Calendar-wide rest-day editor / backfilling arbitrary old dates beyond yesterday.
- Counting rest days as completed (+1) — explicitly rejected.
