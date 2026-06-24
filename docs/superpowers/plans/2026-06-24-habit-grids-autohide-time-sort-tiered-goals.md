# Habit Grids, Completion Auto-Hide, Time Sort & Tiered Goals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-habit history grids on the Progress page, auto-hide completed habits on the dashboard, sort dashboard habits shortest-first, and give each habit optional lighter weekend/vacation goals that still keep its streak.

**Architecture:** A per-day "effective goal" (weekday / weekend / vacation) becomes the foundation: a new `effectiveGoal` helper drives the streak engine, the goal bars, and the completion check. Vacation days are stored like rest days (new table + CRUD). The UI changes (grids, sort, auto-hide, editor inputs, vacation pill) all consume these helpers.

**Tech Stack:** React + TypeScript + react-query (client), Hono + better-sqlite3 + drizzle (server), Vitest (both).

## Global Constraints

- Server auth is **opt-in per route prefix**. Every new route prefix is public until `api.use('<prefix>', requireAuth)` is registered. The new `/vacation-days` routes MUST be registered behind `requireAuth`.
- DB migrations are in-app and idempotent: add columns via `addColumnIfMissing(table, column, type)` and tables via `CREATE TABLE IF NOT EXISTS` in `server/src/db.ts`.
- `weekendGoalMin` / `vacationGoalMin` are **nullable**; `null` means "no reduction — use the normal goal that day." No automatic default is applied to existing habits.
- Client test command: `cd client && npm test`. Run a single file with `cd client && npx vitest run src/lib/stats.test.ts`. Server: `cd server && npm test` / `cd server && npx vitest run src/vacationDays.test.ts`.
- Conventional Commits; commit after each task; push after committing (`git push`).
- Local dates are `'YYYY-MM-DD'` via `dayKey(ts)` (server uses the same `DATE_RE`).

## File Structure

- `server/src/schema.ts` — add `weekendGoalMin`/`vacationGoalMin` columns to `habits`; add `vacationDays` table.
- `server/src/db.ts` — idempotent column adds + `vacation_days` CREATE.
- `server/src/api.ts` — habitInput fields; `/vacation-days` routes; auth registration.
- `server/src/vacationDays.test.ts` — new, mirrors `restDays.test.ts`.
- `client/src/lib/types.ts` — `Habit` goal fields; `VacationDay` type.
- `client/src/lib/hooks.ts` — `useVacationDays`, `useToggleVacationDay`.
- `client/src/lib/stats.ts` — `effectiveGoal`, rewritten `goalStreak`/`habitStreak`, `habitHeatmap`, `isHabitDoneToday`.
- `client/src/lib/stats.test.ts` — updated/added tests.
- `client/src/components/HabitGrid.tsx` — new per-habit grid.
- `client/src/features/habits/HabitCard.tsx` — optional `goalMin` override.
- `client/src/features/dashboard/Dashboard.tsx` — sort-by-time, effective goal, auto-hide.
- `client/src/features/stats/Progress.tsx` — effective goal, embed `HabitGrid`.
- `client/src/features/habits/HabitEditor.tsx` — weekend/vacation goal steppers.
- `client/src/features/tasks/TodayView.tsx` — vacation pill.

---

## Task 1: Server — goal columns, vacation_days table & CRUD

**Files:**
- Modify: `server/src/schema.ts:32-52` (habits), after `restDays` (`server/src/schema.ts:119-124`)
- Modify: `server/src/db.ts:49-66` (habits CREATE), `:137-156` (table + column adds)
- Modify: `server/src/api.ts:5` (import), `:68-69` (auth), `:153-167` (habitInput), `:172-184` (POST row), after `:267` (rest-days block) for new routes
- Test: `server/src/vacationDays.test.ts` (create)

**Interfaces:**
- Produces: `vacationDays` drizzle table (`{ id, userId, date, createdAt }`); `GET/POST/DELETE /vacation-days`; `habits.weekendGoalMin`, `habits.vacationGoalMin` (nullable int).

- [ ] **Step 1: Write the failing test** — `server/src/vacationDays.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-vacationdays-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('vacation_days table + habit goal columns', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let vacationDays: typeof import('./schema').vacationDays;

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ vacationDays } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the vacation_days table', () => {
    const cols = sqlite.prepare('PRAGMA table_info(vacation_days)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['id', 'user_id', 'date', 'created_at']));
  });

  it('adds weekend_goal_min and vacation_goal_min columns to habits', () => {
    const cols = sqlite.prepare('PRAGMA table_info(habits)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['weekend_goal_min', 'vacation_goal_min']));
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('marking the same (user, date) twice keeps a single row', () => {
    const now = Date.now();
    db.insert(vacationDays).values({ id: 'v1', userId: 'u1', date: '2026-07-01', createdAt: now }).onConflictDoNothing().run();
    db.insert(vacationDays).values({ id: 'v2', userId: 'u1', date: '2026-07-01', createdAt: now }).onConflictDoNothing().run();
    const rows = db.select().from(vacationDays).where(and(eq(vacationDays.userId, 'u1'), eq(vacationDays.date, '2026-07-01'))).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('v1');
  });

  it('requires auth on every /vacation-days verb (no cookie → 401)', async () => {
    const { api } = await import('./api');
    expect((await api.request('/vacation-days')).status).toBe(401);
    expect((await api.request('/vacation-days', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await api.request('/vacation-days/2026-07-01', { method: 'DELETE' })).status).toBe(401);
  });
});

// Imported at the bottom so the TIMER_DB env stub above runs first.
import { and, eq } from 'drizzle-orm';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/vacationDays.test.ts`
Expected: FAIL — `vacationDays` is not an export of `./schema` / table missing.

- [ ] **Step 3: Add schema columns and table** — `server/src/schema.ts`

In the `habits` table object, add after the `dailyGoalMin` line (`server/src/schema.ts:44`):

```ts
  dailyGoalMin: integer('daily_goal_min'),
  // Optional lighter goals; NULL = no reduction (use dailyGoalMin that day).
  weekendGoalMin: integer('weekend_goal_min'),
  vacationGoalMin: integer('vacation_goal_min'),
```

Add a new table after `restDays` (`server/src/schema.ts:124`):

```ts
export const vacationDays = sqliteTable('vacation_days', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(), // 'YYYY-MM-DD' local key — lighter goal, not a skip
  createdAt: integer('created_at').notNull(),
});
```

- [ ] **Step 4: Add migration** — `server/src/db.ts`

In the `migrate()` SQL block, after the `rest_days` table/index (`server/src/db.ts:143`), add:

```sql
    CREATE TABLE IF NOT EXISTS vacation_days (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vacation_days_user_date ON vacation_days(user_id, date);
```

After the existing `addColumnIfMissing` calls (`server/src/db.ts:151`), add:

```ts
  addColumnIfMissing('habits', 'weekend_goal_min', 'INTEGER');
  addColumnIfMissing('habits', 'vacation_goal_min', 'INTEGER');
```

- [ ] **Step 5: Wire API — import, auth, input, routes** — `server/src/api.ts`

Add `vacationDays` to the schema import (`server/src/api.ts:5`):

```ts
import { habitGroups, habits, restDays, sessions, taskAttachments, tasks, timers, userSettings, users, vacationDays } from './schema';
```

Register auth after the rest-days line (`server/src/api.ts:68`):

```ts
api.use('/vacation-days', requireAuth); api.use('/vacation-days/*', requireAuth);
```

Add two fields to `habitInput` after `dailyGoalMin` (`server/src/api.ts:161`):

```ts
  weekendGoalMin: z.number().int().positive().nullable().optional(),
  vacationGoalMin: z.number().int().positive().nullable().optional(),
```

Add them to the POST insert row (`server/src/api.ts:179`, in the same object as `dailyGoalMin`):

```ts
    defaultDurationMin: p.data.defaultDurationMin ?? null, dailyGoalMin: p.data.dailyGoalMin ?? null,
    weekendGoalMin: p.data.weekendGoalMin ?? null, vacationGoalMin: p.data.vacationGoalMin ?? null,
```

(The PATCH route already spreads `p.data`, so partial updates pass these through automatically.)

Add the CRUD block after the rest-days routes (`server/src/api.ts:267`):

```ts
/* ---------- vacation days (whole-day lighter goal, still streak-keeping) ---------- */
api.get('/vacation-days', (c) =>
  c.json(db.select().from(vacationDays).where(eq(vacationDays.userId, uid(c))).orderBy(desc(vacationDays.date)).all()));

api.post('/vacation-days', async (c) => {
  const p = z.object({ date: z.string().regex(DATE_RE) }).safeParse(await body(c));
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const existing = db.select().from(vacationDays).where(and(eq(vacationDays.userId, uid(c)), eq(vacationDays.date, p.data.date))).get();
  if (existing) return c.json(existing); // idempotent
  const row = { id: newId(), userId: uid(c), date: p.data.date, createdAt: Date.now() };
  db.insert(vacationDays).values(row).onConflictDoNothing().run();
  return c.json(row, 201);
});

api.delete('/vacation-days/:date', (c) => {
  db.delete(vacationDays).where(and(eq(vacationDays.userId, uid(c)), eq(vacationDays.date, c.req.param('date')))).run();
  return c.json({ ok: true });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run src/vacationDays.test.ts`
Expected: PASS (5 tests). Then `cd server && npm test` — all server tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/schema.ts server/src/db.ts server/src/api.ts server/src/vacationDays.test.ts
git commit -m "feat(habits): vacation_days table + per-habit weekend/vacation goal columns"
git push
```

---

## Task 2: Client types & vacation-day hooks

**Files:**
- Modify: `client/src/lib/types.ts:50` (Habit), after `RestDay` (`:163`)
- Modify: `client/src/lib/hooks.ts:4` (import), after `useToggleRestDay` (`:48`)

**Interfaces:**
- Consumes: server `/vacation-days` routes (Task 1).
- Produces: `Habit.weekendGoalMin`, `Habit.vacationGoalMin` (`number | null`); `VacationDay`; `useVacationDays()` → `VacationDay[]`; `useToggleVacationDay()` mutation `{ date, on }`.

- [ ] **Step 1: Add Habit fields and VacationDay type** — `client/src/lib/types.ts`

After `dailyGoalMin: number | null;` (`client/src/lib/types.ts:50`):

```ts
  dailyGoalMin: number | null;
  weekendGoalMin: number | null; // lighter Sat/Sun goal; null = same as dailyGoalMin
  vacationGoalMin: number | null; // lighter goal on vacation days; null = weekend then daily
```

After the `RestDay` interface (`client/src/lib/types.ts:163`):

```ts
/** A whole day with a lighter per-habit goal that still must be met to keep a streak. */
export interface VacationDay {
  id: string;
  date: string; // 'YYYY-MM-DD' local date
  createdAt: number;
}
```

- [ ] **Step 2: Add hooks** — `client/src/lib/hooks.ts`

Add `VacationDay` to the type import (`client/src/lib/hooks.ts:4`):

```ts
import type { CalendarEvent, Habit, HabitGroup, RestDay, Session, Settings, Task, TaskAttachment, TimerPreset, VacationDay } from './types';
```

After `useToggleRestDay` (`client/src/lib/hooks.ts:48`):

```ts
/* ---- vacation days (whole-day lighter goal) ---- */
export const useVacationDays = () => useQuery({ queryKey: ['vacation-days'], queryFn: () => api.get<VacationDay[]>('/vacation-days') });

/** Toggle a date's vacation status: POST to mark it, DELETE to clear it. */
export function useToggleVacationDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, on }: { date: string; on: boolean }) =>
      on ? api.post('/vacation-days', { date }) : api.del(`/vacation-days/${date}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacation-days'] }),
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd client && npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/hooks.ts
git commit -m "feat(habits): client types + hooks for vacation days and tiered goals"
git push
```

---

## Task 3: Stats — effectiveGoal, streak engine rewrite

**Files:**
- Modify: `client/src/lib/stats.ts:1` (import), `:129-173` (`goalStreak`, `habitStreak`)
- Modify: `client/src/lib/stats.test.ts:2` (import), existing `goalStreak` calls
- Modify (compile-fix only): `client/src/features/dashboard/Dashboard.tsx:25`, `client/src/features/stats/Progress.tsx:41`

**Interfaces:**
- Consumes: `Habit` goal fields (Task 2).
- Produces:
  - `effectiveGoal(habit, ts: number, vacationDays: Set<string>): number | null`
    where `habit: { id: string; dailyGoalMin: number | null; weekendGoalMin?: number | null; vacationGoalMin?: number | null }`
  - `goalStreak(sessions, habit, restDays?: Set<string>, vacationDays?: Set<string>): number`
  - `habitStreak(habit: Habit, sessions, restDays?: Set<string>, vacationDays?: Set<string>): number`

- [ ] **Step 1: Write the failing tests** — append to `client/src/lib/stats.test.ts`

First, add `effectiveGoal` and the new `goalStreak`/`habitStreak` to the import (`client/src/lib/stats.test.ts:2`):

```ts
import { currentStreak, effectiveGoal, focusMinutes, goalStreak, habitStreak, minutesByDay, minutesInRange, todaySummary, todaysHabitSession } from './stats';
```

Append a new describe block at the end of the file:

```ts
describe('tiered goals (weekend / vacation)', () => {
  // A fixed Saturday noon so weekend detection is deterministic.
  const sat = new Date('2026-06-20T12:00:00').getTime(); // 2026-06-20 is a Saturday
  const mon = new Date('2026-06-22T12:00:00').getTime(); // Monday
  const h = { id: 'h1', dailyGoalMin: 30, weekendGoalMin: 5, vacationGoalMin: null };

  it('effectiveGoal: weekday uses the daily goal', () => {
    expect(effectiveGoal(h, mon, new Set())).toBe(30);
  });

  it('effectiveGoal: weekend uses the weekend goal when set', () => {
    expect(effectiveGoal(h, sat, new Set())).toBe(5);
  });

  it('effectiveGoal: weekend falls back to daily goal when weekendGoalMin is null', () => {
    expect(effectiveGoal({ id: 'h1', dailyGoalMin: 30, weekendGoalMin: null, vacationGoalMin: null }, sat, new Set())).toBe(30);
  });

  it('effectiveGoal: vacation falls back to the weekend goal when vacationGoalMin is null', () => {
    const k = dayKey(mon);
    expect(effectiveGoal(h, mon, new Set([k]))).toBe(5); // vacation → null vac → weekend 5
  });

  it('effectiveGoal: vacation uses its own goal when set', () => {
    const k = dayKey(mon);
    const v = { id: 'h1', dailyGoalMin: 30, weekendGoalMin: 5, vacationGoalMin: 2 };
    expect(effectiveGoal(v, mon, new Set([k]))).toBe(2);
  });

  it('effectiveGoal: no daily goal → null on a weekday', () => {
    expect(effectiveGoal({ id: 'h1', dailyGoalMin: null, weekendGoalMin: null, vacationGoalMin: null }, mon, new Set())).toBeNull();
  });
});

describe('goalStreak honors the per-day effective goal', () => {
  const noon = startOfToday() + 12 * 3600_000;
  const isWeekendToday = [0, 6].includes(new Date(noon).getDay());
  const habit = { id: 'h1', dailyGoalMin: 30, weekendGoalMin: 5, vacationGoalMin: null };

  it('a light day that meets the weekend goal keeps the streak (when today is a weekend)', () => {
    if (!isWeekendToday) return; // deterministic only on weekends; effectiveGoal unit tests cover the logic
    const s = [session(noon, { habitId: 'h1', actualSeconds: 300 })]; // 5 min
    expect(goalStreak(s, habit)).toBe(1);
  });

  it('rest days remain transparent under tiered goals', () => {
    const k = dayKey(addDays(noon, -1));
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 1800 }),
      session(addDays(noon, -2), { habitId: 'h1', actualSeconds: 1800 }),
    ];
    expect(goalStreak(s, habit, new Set([k]))).toBe(2); // yesterday rest day bridges
  });

  it('a vacation day still requires its (lighter) goal', () => {
    const k = dayKey(addDays(noon, -1));
    const below = [
      session(noon, { habitId: 'h1', actualSeconds: 1800 }),
      session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 60 }), // 1 min < weekend/vac goal 5
    ];
    // yesterday is a vacation day needing 5 min; only 1 logged → it breaks → streak = today only
    expect(goalStreak(below, habit, new Set(), new Set([k]))).toBe(1);
  });
});
```

- [ ] **Step 2: Update existing goalStreak calls to the new signature** — `client/src/lib/stats.test.ts`

The existing tests call `goalStreak(s, 'h1', 10)` and `goalStreak(s, 'h1', 20, false, new Set([...]))`. Replace each with a habit object and the new arg order:

- `goalStreak(s, 'h1', 10)` → `goalStreak(s, { id: 'h1', dailyGoalMin: 10, weekendGoalMin: null, vacationGoalMin: null })`
- `goalStreak(s, 'h1', 20)` → `goalStreak(s, { id: 'h1', dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null })`
- `goalStreak(s, 'h1', 20, false, new Set([k(-1)]))` → `goalStreak(s, { id: 'h1', dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null }, new Set([k(-1)]))`
- `goalStreak(s, 'h1', 20, false, new Set([k(0)]))` → `goalStreak(s, { id: 'h1', dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null }, new Set([k(0)]))`

(Search the file for `goalStreak(` and convert every call; the third positional arg `dailyGoalMin` moves into the habit object, the old `weekdaysOnly` arg is dropped, and `restDays` becomes the 3rd arg.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd client && npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `effectiveGoal` not exported / `goalStreak` arity mismatch.

- [ ] **Step 4: Implement `effectiveGoal` and rewrite `goalStreak`/`habitStreak`** — `client/src/lib/stats.ts`

Replace `goalStreak` and `habitStreak` (`client/src/lib/stats.ts:122-173`) with:

```ts
/** Minimal habit shape needed to resolve a day's goal. */
type GoalHabit = { id: string; dailyGoalMin: number | null; weekendGoalMin?: number | null; vacationGoalMin?: number | null };

/**
 * The configured goal (minutes) a habit must reach on the local day at `ts`,
 * or null when no goal is configured for that day's tier. Vacation days use the
 * vacation goal, falling back to the weekend goal then the daily goal; weekends
 * use the weekend goal, falling back to the daily goal; weekdays use the daily
 * goal. No 10-minute fallback here — that stays inside goalStreak so it does not
 * leak into the completion/auto-hide check.
 */
export function effectiveGoal(habit: GoalHabit, ts: number, vacationDays: Set<string>): number | null {
  const daily = habit.dailyGoalMin && habit.dailyGoalMin > 0 ? habit.dailyGoalMin : null;
  const weekend = habit.weekendGoalMin && habit.weekendGoalMin > 0 ? habit.weekendGoalMin : null;
  const vacation = habit.vacationGoalMin && habit.vacationGoalMin > 0 ? habit.vacationGoalMin : null;
  if (vacationDays.has(dayKey(ts))) return vacation ?? weekend ?? daily;
  if (isWeekend(ts)) return weekend ?? daily;
  return daily;
}

/**
 * Consecutive days (ending today, or yesterday when today isn't met yet) on
 * which the habit reached its per-day {@link effectiveGoal} — or at least 10
 * minutes when that day has no configured goal. Dates in `restDays` are
 * invisible (never break, never count). Vacation days are NOT skipped: they
 * simply demand the lighter vacation goal.
 */
export function goalStreak(
  sessions: Session[],
  habit: GoalHabit,
  restDays: Set<string> = new Set(),
  vacationDays: Set<string> = new Set(),
): number {
  const minByDay: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.completed || s.habitId !== habit.id) continue;
    const k = dayKey(s.startedAt);
    minByDay[k] = (minByDay[k] ?? 0) + s.actualSeconds / 60;
  }
  const need = (ts: number) => effectiveGoal(habit, ts, vacationDays) ?? 10; // no goal → any 10-min day
  const met = (ts: number) => (minByDay[dayKey(ts)] ?? 0) >= need(ts) - 1e-9;
  const skip = (ts: number) => restDays.has(dayKey(ts));
  const back = (ts: number) => {
    let c = addDays(ts, -1);
    while (skip(c)) c = addDays(c, -1);
    return c;
  };
  let cursor = startOfToday();
  while (skip(cursor)) cursor = addDays(cursor, -1);
  if (!met(cursor)) {
    cursor = back(cursor);
    if (!met(cursor)) return 0;
  }
  let streak = 0;
  while (met(cursor)) {
    streak += 1;
    cursor = back(cursor);
  }
  return streak;
}

/**
 * The streak to show for a habit: clean-day {@link currentStreak} for abstinence
 * habits, goal-met {@link goalStreak} for time habits. `restDays` bridge both;
 * `vacationDays` apply the lighter goal to time habits.
 */
export function habitStreak(habit: Habit, sessions: Session[], restDays: Set<string> = new Set(), vacationDays: Set<string> = new Set()): number {
  return habit.kind === 'abstain'
    ? currentStreak(sessions, habit.id, restDays)
    : goalStreak(sessions, habit, restDays, vacationDays);
}
```

(The `isWeekend` const at `client/src/lib/stats.ts:117-120` stays and is now used by `effectiveGoal`.)

- [ ] **Step 5: Fix the two callers so the app compiles** — Dashboard & Progress

`client/src/features/dashboard/Dashboard.tsx:24-25` — drop the `weekdaysOnly` set and pass vacation days. Replace:

```ts
  const weekdaysOnly = new Set(groups.filter((g) => g.weekdaysOnly).map((g) => g.id));
  const streakFor = (h: Habit) => habitStreak(h, sessions, !!h.groupId && weekdaysOnly.has(h.groupId), restDays);
```

with (note: `useVacationDays` is imported and read in Task 5/6; for now add the import and read it here):

```ts
  const vacationDays = new Set(vacationRows.map((r) => r.date));
  const streakFor = (h: Habit) => habitStreak(h, sessions, restDays, vacationDays);
```

Add to the hook reads near `client/src/features/dashboard/Dashboard.tsx:16`:

```ts
  const { data: vacationRows = [] } = useVacationDays();
```

and add `useVacationDays` to the import from `'../../lib/hooks'` (`client/src/features/dashboard/Dashboard.tsx:2`).

`client/src/features/stats/Progress.tsx:18,41` — replace the `weekdaysOnlyGroups` usage. Change the import line (`client/src/features/stats/Progress.tsx:3`) to include `useVacationDays`, add `const { data: vacationRows = [] } = useVacationDays();` and `const vacationDays = new Set(vacationRows.map((r) => r.date));` near the other sets (`:17-19`), delete the `weekdaysOnlyGroups` line (`:18`), and change the streak line (`:41`) to:

```ts
      streak: habitStreak(h, sessions, restDays, vacationDays),
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd client && npx vitest run src/lib/stats.test.ts` → PASS
Run: `cd client && npx tsc --noEmit` → PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/stats.ts client/src/lib/stats.test.ts client/src/features/dashboard/Dashboard.tsx client/src/features/stats/Progress.tsx
git commit -m "feat(habits): tiered effectiveGoal + streak engine using weekend/vacation goals"
git push
```

---

## Task 4: Stats — habitHeatmap & isHabitDoneToday

**Files:**
- Modify: `client/src/lib/stats.ts` (append two functions)
- Modify: `client/src/lib/stats.test.ts` (append tests + import)

**Interfaces:**
- Produces:
  - `habitHeatmap(sessions, days: number, habitId: string): { date: string; minutes: number; done: boolean }[]` (oldest-first)
  - `isHabitDoneToday(habit: Habit, summary: TodaySummary, effectiveGoalToday: number | null): boolean`

- [ ] **Step 1: Write the failing tests** — append to `client/src/lib/stats.test.ts`

Add `habitHeatmap, isHabitDoneToday` to the import (`client/src/lib/stats.test.ts:2`). Append:

```ts
describe('habitHeatmap', () => {
  const noon = startOfToday() + 12 * 3600_000;

  it('returns `days` entries oldest-first ending today', () => {
    const grid = habitHeatmap([], 7, 'h1');
    expect(grid).toHaveLength(7);
    expect(grid[6].date).toBe(dayKey(noon));
    expect(grid[0].date).toBe(dayKey(addDays(noon, -6)));
  });

  it('sums only the given habit and marks done days', () => {
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 1200 }),
      session(noon, { habitId: 'h2', actualSeconds: 1200 }),
      session(noon, { habitId: 'h1', actualSeconds: 0 }), // abstain-style mark, 0 min
    ];
    const grid = habitHeatmap(s, 3, 'h1');
    const today = grid[2];
    expect(today.minutes).toBe(20);
    expect(today.done).toBe(true);
    expect(grid[1].done).toBe(false);
  });
});

describe('isHabitDoneToday', () => {
  const summary = { count: 1, minutes: 20, doneHabitIds: new Set(['a1']), minutesByHabit: { t1: 20 } };
  const time = (over: Partial<Habit>) => ({ id: 't1', kind: 'time', ...over } as Habit);

  it('time habit is done when minutes reach the effective goal', () => {
    expect(isHabitDoneToday(time({}), summary as any, 20)).toBe(true);
    expect(isHabitDoneToday(time({}), summary as any, 30)).toBe(false);
  });

  it('time habit with no effective goal today is never done', () => {
    expect(isHabitDoneToday(time({}), summary as any, null)).toBe(false);
  });

  it('abstain habit is done when marked', () => {
    expect(isHabitDoneToday({ id: 'a1', kind: 'abstain' } as Habit, summary as any, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `habitHeatmap` / `isHabitDoneToday` not exported.

- [ ] **Step 3: Implement** — append to `client/src/lib/stats.ts`

```ts
/** Per-habit version of {@link heatmap}: last `days` local days (oldest first),
 *  each with that habit's minutes and whether any completed session occurred. */
export function habitHeatmap(sessions: Session[], days: number, habitId: string): { date: string; minutes: number; done: boolean }[] {
  const minByDay: Record<string, number> = {};
  const doneDays = new Set<string>();
  for (const s of sessions) {
    if (s.habitId !== habitId || !s.completed) continue;
    const k = dayKey(s.startedAt);
    minByDay[k] = (minByDay[k] ?? 0) + s.actualSeconds / 60;
    doneDays.add(k);
  }
  const t0 = startOfToday();
  const out: { date: string; minutes: number; done: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(addDays(t0, -i));
    out.push({ date: k, minutes: Math.round(minByDay[k] ?? 0), done: doneDays.has(k) });
  }
  return out;
}

/** Whether a habit counts as completed for today (drives the dashboard auto-hide).
 *  Abstain → marked today. Time → minutes reach today's effective goal; a habit
 *  with no configured goal today is never auto-completed. */
export function isHabitDoneToday(habit: Habit, summary: TodaySummary, effectiveGoalToday: number | null): boolean {
  if (habit.kind === 'abstain') return summary.doneHabitIds.has(habit.id);
  if (effectiveGoalToday == null) return false;
  return (summary.minutesByHabit[habit.id] ?? 0) >= effectiveGoalToday - 1e-9;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/lib/stats.test.ts` → PASS
Run: `cd client && npx tsc --noEmit` → PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/stats.ts client/src/lib/stats.test.ts
git commit -m "feat(habits): habitHeatmap + isHabitDoneToday helpers"
git push
```

---

## Task 5: HabitCard goal override + Dashboard effective-goal display

**Files:**
- Modify: `client/src/features/habits/HabitCard.tsx:19-46` (props), `:41` (goal)
- Modify: `client/src/features/dashboard/Dashboard.tsx:45-57` (card)

**Interfaces:**
- Consumes: `effectiveGoal` (Task 3).
- Produces: `HabitCard` accepts optional `goalMin?: number | null`; when provided it overrides `habit.dailyGoalMin` for the goal bar.

- [ ] **Step 1: Add `goalMin` prop to HabitCard** — `client/src/features/habits/HabitCard.tsx`

Add `goalMin` to the destructured props and the type (after `streak`, `client/src/features/habits/HabitCard.tsx:27` and `:37`):

```ts
  streak = 0,
  goalMin,
  onToggle,
```

```ts
  streak?: number;
  goalMin?: number | null; // effective goal for today; falls back to habit.dailyGoalMin
  onToggle?: (h: Habit) => void;
```

Change the `goal` derivation (`client/src/features/habits/HabitCard.tsx:41`):

```ts
  const rawGoal = goalMin !== undefined ? goalMin : habit.dailyGoalMin;
  const goal = rawGoal && rawGoal > 0 ? rawGoal : null;
```

- [ ] **Step 2: Pass today's effective goal from the Dashboard** — `client/src/features/dashboard/Dashboard.tsx`

Add `effectiveGoal` and `startOfToday` to imports (`client/src/features/dashboard/Dashboard.tsx:5` from `../../lib/stats`, and `startOfToday` from `../../lib/time`). In the `card` builder (`:45-57`), add the `goalMin` prop:

```ts
  const card = (h: Habit) => (
    <HabitCard
      key={h.id}
      habit={h}
      minutesToday={today.minutesByHabit[h.id] ?? 0}
      onStart={start}
      onLog={log}
      editTo={`/habits/${h.id}`}
      markedToday={today.doneHabitIds.has(h.id)}
      streak={streakFor(h)}
      goalMin={effectiveGoal(h, startOfToday(), vacationDays)}
      onToggle={toggleAbstain}
    />
  );
```

- [ ] **Step 3: Verify build + manual check**

Run: `cd client && npx tsc --noEmit` → PASS
Run: `cd client && npm test` → PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
git add client/src/features/habits/HabitCard.tsx client/src/features/dashboard/Dashboard.tsx
git commit -m "feat(habits): habit cards show today's effective goal (lighter on weekends/vacation)"
git push
```

---

## Task 6: HabitGrid component + Progress page integration

**Files:**
- Create: `client/src/components/HabitGrid.tsx`
- Modify: `client/src/features/stats/Progress.tsx:6` (import), `:40` (goal), `:111-119` (card body)

**Interfaces:**
- Consumes: `habitHeatmap` (Task 4), `categoryColor` (`client/src/lib/palette`), `effectiveGoal` (Task 3).
- Produces: `<HabitGrid habit={Habit} sessions={Session[]} weekStart={number} />`.

- [ ] **Step 1: Create the component** — `client/src/components/HabitGrid.tsx`

```tsx
import type { Habit, Session } from '../lib/types';
import { habitHeatmap } from '../lib/stats';
import { categoryColor } from '../lib/palette';

const WEEKS = 18;

/**
 * A per-habit activity grid (18 weeks, 7 rows). Time habits shade each day by
 * the habit's minutes in its own category color; abstinence habits fill days
 * they were marked. Mirrors the layout of the global "Minutes / day" graph.
 */
export function HabitGrid({ habit, sessions, weekStart }: { habit: Habit; sessions: Session[]; weekStart: number }) {
  const days = habitHeatmap(sessions, WEEKS * 7, habit.id);
  const firstDay = new Date(days[0].date + 'T00:00:00');
  const lead = (firstDay.getDay() - weekStart + 7) % 7;
  const color = categoryColor(habit.id);
  const empty = 'rgb(var(--ink-700))';

  function fill(d: { minutes: number; done: boolean }): string {
    if (habit.kind === 'abstain') return d.done ? `rgb(${color.rgb})` : empty;
    if (d.minutes <= 0) return empty;
    const op = d.minutes < 10 ? 0.35 : d.minutes < 20 ? 0.55 : d.minutes < 40 ? 0.78 : 1;
    return `rgb(${color.rgb} / ${op})`;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="grid grid-flow-col gap-1" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead${i}`} className="h-3 w-3" />
        ))}
        {days.map((d) => (
          <div
            key={d.date}
            title={habit.kind === 'abstain' ? `${d.date}: ${d.done ? 'done' : '—'}` : `${d.date}: ${d.minutes} min`}
            className="h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: fill(d) }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Embed it on the Progress page** — `client/src/features/stats/Progress.tsx`

Add the import (after `client/src/features/stats/Progress.tsx:8`):

```ts
import { HabitGrid } from '../../components/HabitGrid';
```

Change the `goal` in the `ranked` map (`client/src/features/stats/Progress.tsx:40`) to use today's effective goal so the card's bar matches the dashboard:

```ts
      goal: effectiveGoal(h, startOfToday(), vacationDays),
```

Add `effectiveGoal` to the stats import (`client/src/features/stats/Progress.tsx:6`). `startOfToday` is already imported (`:7`).

In each per-habit card, add the grid after the goal/clean-day body. Replace the block (`client/src/features/stats/Progress.tsx:111-119`) so the grid renders for every habit:

```tsx
                {abstain ? (
                  <div className="text-xs text-slate-400">
                    {streak > 0 ? `${streak}-day clean streak` : 'No clean streak yet'}
                  </div>
                ) : goal ? (
                  <GoalBar done={minutes} goal={goal} rgb={color.rgb} />
                ) : (
                  <div className="text-xs text-slate-400">{Math.round(minutes)} min today · no goal set</div>
                )}
                <HabitGrid habit={h} sessions={sessions} weekStart={weekStart} />
```

- [ ] **Step 3: Verify build**

Run: `cd client && npx tsc --noEmit` → PASS
Run: `cd client && npm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/HabitGrid.tsx client/src/features/stats/Progress.tsx
git commit -m "feat(progress): per-habit activity grid on each habit card"
git push
```

---

## Task 7: Dashboard — sort by time + auto-hide completed habits

**Files:**
- Modify: `client/src/features/dashboard/Dashboard.tsx:5` (import), `:58-99` (lists + render)

**Interfaces:**
- Consumes: `isHabitDoneToday`, `effectiveGoal` (Tasks 3–4).
- Produces: dashboard groups sorted by default duration ascending; completed habits collected into a bottom "completed today" strip.

- [ ] **Step 1: Add the sort + completion helpers** — `client/src/features/dashboard/Dashboard.tsx`

Add `isHabitDoneToday` to the `../../lib/stats` import (`client/src/features/dashboard/Dashboard.tsx:5`). Add `useState` to the React import at the top of the file. Near the other derived values (after `client/src/features/dashboard/Dashboard.tsx:25`), add:

```ts
  const [showDone, setShowDone] = useState(false);
  const durOf = (h: Habit) => (h.kind === 'abstain' ? Infinity : h.defaultDurationMin ?? h.durations?.[0] ?? Infinity);
  const byTime = (a: Habit, b: Habit) => durOf(a) - durOf(b) || a.name.localeCompare(b.name);
  const doneToday = (h: Habit) => isHabitDoneToday(h, today, effectiveGoal(h, startOfToday(), vacationDays));
  const doneHabits = active.filter(doneToday).sort(byTime);
```

- [ ] **Step 2: Sort group lists by time and exclude completed** — `client/src/features/dashboard/Dashboard.tsx`

Change the grouped list (`client/src/features/dashboard/Dashboard.tsx:78`):

```ts
        const list = active.filter((h) => h.groupId === group.id && !doneToday(h)).sort(byTime);
```

Change the ungrouped list (`client/src/features/dashboard/Dashboard.tsx:60`):

```ts
  const ungrouped = active.filter((h) => (!h.groupId || !groups.some((g) => g.id === h.groupId)) && !doneToday(h)).sort(byTime);
```

- [ ] **Step 3: Render the "completed today" strip** — `client/src/features/dashboard/Dashboard.tsx`

Add, just before the bottom action buttons block (before `client/src/features/dashboard/Dashboard.tsx:105`):

```tsx
      {doneHabits.length > 0 && (
        <section>
          <button
            onClick={() => setShowDone((v) => !v)}
            className="label flex items-center gap-1.5 text-slate-400 transition hover:text-slate-200"
          >
            ✓ {doneHabits.length} completed today · {showDone ? 'hide' : 'show'}
          </button>
          {showDone && (
            <div className="mt-2 grid gap-3 opacity-70 sm:grid-cols-2 xl:grid-cols-3">
              {doneHabits.map(card)}
            </div>
          )}
        </section>
      )}
```

- [ ] **Step 4: Verify build + manual smoke**

Run: `cd client && npx tsc --noEmit` → PASS
Run: `cd client && npm test` → PASS
Manual: in dev, a habit that hits its goal (or an abstain marked done) leaves its group and appears under "completed today"; un-marking returns it.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/dashboard/Dashboard.tsx
git commit -m "feat(dashboard): sort habits shortest-first and auto-hide completed habits"
git push
```

---

## Task 8: HabitEditor — weekend & vacation goal inputs

**Files:**
- Modify: `client/src/features/habits/HabitEditor.tsx:26-41` (state/load), `:62-75` (save), `:176-185` (UI)

**Interfaces:**
- Consumes: `Habit.weekendGoalMin`, `Habit.vacationGoalMin` (Task 2); `Stepper` component.
- Produces: editor persists `weekendGoalMin` / `vacationGoalMin` (null when 0).

- [ ] **Step 1: Add state and load existing values** — `client/src/features/habits/HabitEditor.tsx`

After `const [goal, setGoal] = useState(20);` (`client/src/features/habits/HabitEditor.tsx:26`):

```ts
  const [weekendGoal, setWeekendGoal] = useState(0); // 0 = same as daily goal
  const [vacationGoal, setVacationGoal] = useState(0); // 0 = same as weekend/daily
```

In the load effect after `setGoal(existing.dailyGoalMin ?? 0);` (`client/src/features/habits/HabitEditor.tsx:37`):

```ts
    setWeekendGoal(existing.weekendGoalMin ?? 0);
    setVacationGoal(existing.vacationGoalMin ?? 0);
```

- [ ] **Step 2: Persist on save** — `client/src/features/habits/HabitEditor.tsx`

In `onSave`, after `dailyGoalMin: ...` (`client/src/features/habits/HabitEditor.tsx:73`):

```ts
      dailyGoalMin: kind === 'time' && goal > 0 ? goal : null,
      weekendGoalMin: kind === 'time' && weekendGoal > 0 ? weekendGoal : null,
      vacationGoalMin: kind === 'time' && vacationGoal > 0 ? vacationGoal : null,
```

- [ ] **Step 3: Add the inputs** — `client/src/features/habits/HabitEditor.tsx`

Inside the existing daily-goal card, after the daily-goal hint block (`client/src/features/habits/HabitEditor.tsx:183`, before the card's closing `</div>`):

```tsx
        <div className="mt-4 border-t border-ink-600/60 pt-3">
          <Stepper label="Weekend goal" value={weekendGoal} onChange={setWeekendGoal} min={0} max={120} step={5} suffix="min" />
          <p className="mt-2 text-xs text-slate-400">{weekendGoal > 0 ? `${weekendGoal} min on Sat/Sun` : 'Weekends use the daily goal'}</p>
        </div>
        <div className="mt-4 border-t border-ink-600/60 pt-3">
          <Stepper label="Vacation goal" value={vacationGoal} onChange={setVacationGoal} min={0} max={120} step={5} suffix="min" />
          <p className="mt-2 text-xs text-slate-400">
            {vacationGoal > 0 ? `${vacationGoal} min on vacation days` : weekendGoal > 0 ? 'Vacation days use the weekend goal' : 'Vacation days use the daily goal'}
          </p>
        </div>
```

- [ ] **Step 4: Verify build + manual check**

Run: `cd client && npx tsc --noEmit` → PASS
Manual: edit a time habit, set Weekend goal 5, save, reopen — value persists; abstain habits show no goal section (unchanged, the whole block is already gated by `kind === 'time'`).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/habits/HabitEditor.tsx
git commit -m "feat(habits): edit per-habit weekend and vacation goals"
git push
```

---

## Task 9: TodayView — Vacation pill

**Files:**
- Modify: `client/src/features/tasks/TodayView.tsx:1-2` (imports), `:7` (icon import), `:16-31` (hooks/state), `:54-68` (header pills)

**Interfaces:**
- Consumes: `useVacationDays`, `useToggleVacationDay` (Task 2).
- Produces: a "Vacation" toggle for today + a "mark yesterday" affordance, mirroring the rest-day controls.

- [ ] **Step 1: Wire hooks + icon** — `client/src/features/tasks/TodayView.tsx`

Add `useVacationDays, useToggleVacationDay` to the `'../../lib/hooks'` import (`client/src/features/tasks/TodayView.tsx:2`). Add `Palmtree` to the lucide import (`client/src/features/tasks/TodayView.tsx:7`):

```ts
import { Flame, Timer as TimerIcon, Clock, Moon, Palmtree } from 'lucide-react';
```

Near the rest-day reads (`client/src/features/tasks/TodayView.tsx:16-31`):

```ts
  const { data: vacationRows = [] } = useVacationDays();
  const toggleVacation = useToggleVacationDay();
```

and after `const restingYesterday = ...` (`:31`):

```ts
  const vacationDays = new Set(vacationRows.map((r) => r.date));
  const vacationingToday = vacationDays.has(tk);
  const vacationingYesterday = vacationDays.has(yk);
```

- [ ] **Step 2: Add the pills** — `client/src/features/tasks/TodayView.tsx`

After the "Mark yesterday" rest-day button (`client/src/features/tasks/TodayView.tsx:68`), add:

```tsx
          <button
            onClick={() => toggleVacation.mutate({ date: tk, on: !vacationingToday })}
            className="stat-pill transition hover:opacity-80"
            style={vacationingToday ? { color: 'rgb(34 197 94)' } : undefined}
            title="Vacation day — habits keep their streak at a lighter goal"
          >
            <Palmtree size={15} /> {vacationingToday ? 'On vacation' : 'Vacation'}
          </button>
          <button
            onClick={() => toggleVacation.mutate({ date: yk, on: !vacationingYesterday })}
            className="text-xs text-slate-500 transition hover:text-slate-300"
            title="Mark yesterday as a vacation day"
          >
            {vacationingYesterday ? 'Yesterday: vacation' : 'Mark yesterday'}
          </button>
```

- [ ] **Step 3: Verify build + manual check**

Run: `cd client && npx tsc --noEmit` → PASS
Manual: the "Vacation" pill toggles today; with a weekday vacation goal set on a habit, that habit's goal bar on the dashboard drops to the lighter goal for a vacation day.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/tasks/TodayView.tsx
git commit -m "feat(today): vacation-day toggle pill in the Today header"
git push
```

---

## Task 10: Full verification & cleanup

**Files:**
- Modify (only if found): `client/src/features/habits/*` group editor with a `weekdaysOnly` toggle

- [ ] **Step 1: Retire the dormant `weekdaysOnly` UI**

Search for any remaining UI control bound to `weekdaysOnly`:

Run: `grep -rn "weekdaysOnly\|weekdays_only\|weekdays only" client/src`
If a group-editor toggle exists, remove that control (the DB column and `HabitGroup.weekdaysOnly` type stay, now dormant). If only the `HabitGroup` type and unused reads remain, leave them. Do not delete the schema column.

- [ ] **Step 2: Run the whole suite**

Run: `cd server && npm test` → PASS
Run: `cd client && npm test` → PASS
Run: `cd client && npx tsc --noEmit` and `cd server && npx tsc --noEmit` → PASS

- [ ] **Step 3: Manual end-to-end smoke (dev)**

Per the local-dev recipe: start server + client, log in. Verify:
- Progress page shows a colored grid under each habit card.
- A habit that meets its goal disappears from its dashboard group and shows under "✓ N completed today".
- Dashboard groups are ordered shortest-duration-first.
- Setting a weekend goal makes that habit's dashboard goal bar read the lighter number on a Saturday/Sunday.
- Toggling the Vacation pill applies the vacation goal for that day.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore(habits): retire dormant weekdays-only control"
git push
```

---

## Self-Review notes (addressed)

- **Spec coverage:** Feature 4 (Tasks 1–3, 5, 8, 9), Feature 1 grids (Tasks 4, 6), Feature 2 auto-hide (Tasks 4, 7), Feature 3 sort (Task 7). Goal display (Task 5/6). `requireAuth` for `/vacation-days` (Task 1, Step 5 + test). `weekdaysOnly` retirement (Tasks 3 + 10).
- **`effectiveGoal` returns `number | null`** (no 10-min fallback) so the completion check in Task 4 can never auto-hide a no-goal habit; the `?? 10` lives only inside `goalStreak` (Task 3).
- **Signature consistency:** `goalStreak(sessions, habit, restDays?, vacationDays?)` and `habitStreak(habit, sessions, restDays?, vacationDays?)` are used identically in Tasks 3, 5, 6, 7 and the updated tests.
