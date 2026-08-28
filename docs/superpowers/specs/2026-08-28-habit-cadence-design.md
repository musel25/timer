# Habit cadence: daily / weekly / monthly layers with structured entries

Date: 2026-08-28
Status: approved, implementing

## Problem

The habit system is strictly daily. `habits.daily_goal_min` is a per-day target
and every streak function in `client/src/lib/stats.ts` walks back consecutive
calendar days. That cannot express a habit like "go outside once a week" or
"review your life once a month", and there is nowhere to put the structured
answers a reflective habit produces — a 0–10 life-review rating, an
anticipated-vs-actual discomfort pair, the book you read.

The target system is deliberately lean: 4 daily habits, 6 weekly, 4 monthly.
Leanness is a requirement, not a nicety — a tracker with twelve daily rows
becomes the chore it was meant to displace.

## Decisions

### Storage: extend `sessions`, do not add a second log

Every completion stays a row in `sessions`, which is already how abstinence
habits log (`planned_seconds = 0, actual_seconds = 0, completed = 1`). Two new
columns carry the new information:

- `entry TEXT` — JSON payload for the habit's template, or NULL.
- `period_key TEXT` — `'2026-08-28'` | `'2026-W35'` | `'2026-08'`.

`period_key` is **computed on the client and sent with the write.** The server
has no idea what timezone the user is in — the same reason `dayKey` lives in
`client/src/lib/time.ts` and not on the server. A server-side derivation would
misfile every entry made near midnight.

Rejected: a separate `habit_entries` table. It is semantically tidier (a monthly
life review is not a "session") but splits the log in two — minutes in
`sessions`, completions in `habit_entries` — forcing every stat, the export and
the import to read both and reconcile them. Daily habits want minutes anyway,
and weekly Music/Nature have minute floors, so those rows exist regardless.

### Habit model

Four new columns on `habits`:

| Column | Meaning |
|---|---|
| `cadence TEXT NOT NULL DEFAULT 'daily'` | `'daily' \| 'weekly' \| 'monthly'` |
| `anchor INTEGER` | weekly: weekday 0–6 (0 = Sunday). monthly: day-of-month 1–28. daily: NULL |
| `target_count INTEGER NOT NULL DEFAULT 1` | occurrences needed per period (Music = 2) |
| `template TEXT` | entry form id, or NULL for "done + optional note" |

The `DEFAULT 'daily'` means all nine existing habits keep working untouched.

`kind` gains a third value, `'check'`, alongside `'time' | 'abstain'`: for
Courage, Social, Create and the reviews, where minutes are meaningless and a
duration picker is noise. Music and Nature stay `'time'`, reusing
`daily_goal_min` as a **per-occurrence minute floor** (20 and 30).

### Anchor semantics: soft

The anchor day is *when the habit surfaces and nudges*, not when it counts.
Completion counts anywhere in the period. Nature anchored to Saturday but walked
on Wednesday satisfies the week and stops appearing on Saturday. Rationale:
courage and social opportunities vary by week; a hard anchor would force either
a faked log or a broken streak the user had actually earned.

### Satisfaction and streaks

A period is satisfied when occurrences ≥ `target_count`, where an occurrence is:

- `check` — any completed session in the period.
- `time` — a completed session whose minutes ≥ the per-occurrence floor
  (`daily_goal_min`); with no floor configured, any completed session.
- `abstain` — daily only; unchanged.

For `cadence = 'daily'` the existing behaviour is preserved exactly: daily time
habits keep summing minutes across the day against `effectiveGoal` rather than
counting occurrences, so weekend/vacation goals still apply.

Streak = consecutive satisfied periods walking back from the current one, with
the same grace rule already in `goalStreak` (an unsatisfied *current* period does
not break the streak; the walk starts from the previous one).

Rest days and vacation days keep applying to **daily habits only**. A rest day
should not excuse an entire month.

### Entry templates

Defined as data in `client/src/features/habits/templates.ts`, rendered by one
generic `EntryForm`. Adding a template later is a data edit.

| id | fields |
|---|---|
| `journal` | weekday theme + sub-questions (auto, read-only) · text |
| `read` | minutes · book (prefilled with last book) |
| `leetcode` | problem · difficulty (Easy/Medium/Hard) |
| `courage` | what I did · anticipated 1–5 · actual 1–5 |
| `weekly-review` | best · worst · learned · change next week |
| `life-review` | 9 ratings 0–10 · 7 open questions |
| `simplify` | category (10 choices) · note |
| *(NULL)* | done + optional note |

The journal theme rotates **Mon–Sat over six themes**. Sunday is deliberately
absent: its theme ("best/worst/learned/change next week") *is* the weekly review
habit, anchored to Sunday with the `weekly-review` template. One prompt on
Sunday, not two.

The courage idea list (social / non-social) ships behind a "need an idea?"
toggle inside that form.

## UI

**`/habits` Today** keeps the Morning/Work/Night groups for daily habits. A
weekly or monthly habit joins Today **only on its anchor day, and only while its
period is unsatisfied**.

**Two pill strips** below Today — `This week` (6 pills) and `This month` (4) —
each pill showing name, done state and `n/target`. Tapping opens the entry form.
This is how a weekly habit gets logged on a non-anchor day, in one row per layer
rather than twelve list items.

**Entry sheet** — a modal rendering the template's fields; writes one session
with `period_key` and the JSON `entry`.

**`HabitDetail`** becomes cadence-aware: weekly habits show a grid of weeks,
monthly a row of months, both with a timeline of past entries. Two charts earn
their place — courage's anticipated vs actual over time (the gap is the point),
and the life review's nine ratings as small multiples.

**`HabitEditor`** gains cadence / anchor / target-count / template controls. The
template is locked once entries exist.

## Seeding

A one-time guarded migration in `server/src/db.ts`, following the existing
`addColumnIfMissing('habits', 'kind', ...)` → `backfillDefaults()` pattern: set
`cadence`/`template` on current habits, then add Portuguese, the six weekly and
the four monthly habits.

It deletes nothing. Pruning Anki / Math Training / Prog. Read down to the lean
four is a user decision made in the editor, not a migration side effect.

## Testing

- `client/src/lib/cadence.test.ts` — period keys across timezone boundaries, ISO
  week rollover at year end, month arithmetic.
- `client/src/lib/stats.test.ts` — cadence streaks, target counts > 1, the grace
  rule, and regression proof that daily behaviour is unchanged.
- `server/src/habitCadence.test.ts` — new columns round-trip through the API,
  defaults applied, export/import preserve them.

## Staging

1. Schema + cadence engine + generalized streaks (no UI)
2. Templates + entry sheet + Today integration
3. Pill strips + seeding
4. `HabitDetail` history and charts, `HabitEditor` controls
