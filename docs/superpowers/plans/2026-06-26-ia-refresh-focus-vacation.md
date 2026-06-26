# IA Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim the navigation (drop Today/Month), unify the running timer into one shared run that can be tagged to a habit (deleting the old focus "umbrella"), add a per-habit drill-down page, and let vacation/rest days be painted as date ranges in that drill-down.

**Architecture:** Client is React + Vite + TS + Tailwind, React Router, TanStack Query. Server is Hono + Drizzle + better-sqlite3. Range marking adds bulk server endpoints + query hooks; focus tagging is a single-slot rework of `RunContext`/`ActiveRun`; the drill-down is a new route reusing existing stats + calendar helpers.

**Tech Stack:** React 18, react-router-dom, @tanstack/react-query, vitest, Hono, drizzle-orm.

## Global Constraints

- Do **not** modify `client/src/features/timer/Timer.tsx`, `client/src/features/timers/TimerEditor.tsx`, `client/src/features/timers/TimersLibrary.tsx`, or the `/timer*` / `/timers*` / `/focus` / `/quick` routes — those are owned by the parallel `feat/unified-timer-page` effort.
- In `client/src/App.tsx`, edit only the Today/Month route lines, the `/` landing line, and the `/habits/:id` lines. Leave every `/timer*` and `/timers*` route untouched (merge reconciliation keeps both sets).
- Date keys are local `'YYYY-MM-DD'` strings throughout; reuse helpers in `client/src/lib/date.ts` (`todayKey`, `addDaysKey`, `keyToDate`, `monthMatrix`) and `server` date strings as-is. Date regex on the server is the existing `DATE_RE`.
- Vacation = lighter goal (`effectiveGoal`), rest = streak-skip. Do not change that goal/streak math.
- Run `npm test` (server + client) green before declaring the plan done.
- Commit after every task. Work stays on branch `worktree-ia-refresh-focus-vacation`.

---

## Task 1: Server range helper (`datesInclusive`)

**Files:**
- Create: `server/src/range.ts`
- Test: `server/src/range.test.ts`

**Interfaces:**
- Produces: `datesInclusive(start: string, end: string): string[]` — inclusive list of `YYYY-MM-DD` keys; `MAX_RANGE_DAYS = 366`.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/range.test.ts
import { describe, expect, it } from 'vitest';
import { datesInclusive, MAX_RANGE_DAYS } from './range';

describe('datesInclusive', () => {
  it('returns a single day when start === end', () => {
    expect(datesInclusive('2026-07-10', '2026-07-10')).toEqual(['2026-07-10']);
  });
  it('returns every inclusive day across a month boundary', () => {
    expect(datesInclusive('2026-06-29', '2026-07-02')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
    ]);
  });
  it('throws when start > end', () => {
    expect(() => datesInclusive('2026-07-10', '2026-07-09')).toThrow();
  });
  it('throws when the range exceeds MAX_RANGE_DAYS', () => {
    expect(() => datesInclusive('2024-01-01', '2026-01-01')).toThrow();
    expect(MAX_RANGE_DAYS).toBe(366);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- range`
Expected: FAIL — cannot find `./range`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/src/range.ts
export const MAX_RANGE_DAYS = 366;

/** Inclusive list of 'YYYY-MM-DD' local keys from start to end. */
export function datesInclusive(start: string, end: string): string[] {
  // Parse as UTC noon to avoid DST edge shifts on the date arithmetic.
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new Error('invalid_date');
  if (s.getTime() > e.getTime()) throw new Error('start_after_end');
  const out: string[] = [];
  for (let d = s; d.getTime() <= e.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > MAX_RANGE_DAYS) throw new Error('range_too_long');
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test -- range`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/range.ts server/src/range.test.ts
git commit -m "feat(server): add datesInclusive range helper"
```

---

## Task 2: Vacation + rest range endpoints

**Files:**
- Modify: `server/src/api.ts` (add after the existing `/vacation-days` and `/rest-days` route blocks, ~lines 253-289)
- Test: `server/src/range.endpoints.test.ts`

**Interfaces:**
- Consumes: `datesInclusive`, `MAX_RANGE_DAYS` (Task 1); `db`, `vacationDays`, `restDays`, `newId`, `uid`, `body`, `DATE_RE`.
- Produces: `POST /vacation-days/range`, `DELETE /vacation-days/range`, `POST /rest-days/range`, `DELETE /rest-days/range` — body `{ start, end }`.

- [ ] **Step 1: Write the failing test** (DB-effect level, mirroring `vacationDays.test.ts`)

```ts
// server/src/range.endpoints.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'timer-range-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('applyRange helper inserts/deletes inclusive ranges', () => {
  let db: typeof import('./db').db, migrate: typeof import('./db').migrate, sqlite: import('better-sqlite3').Database;
  let vacationDays: typeof import('./schema').vacationDays;
  let applyVacationRange: typeof import('./api').applyVacationRange;
  let and: typeof import('drizzle-orm').and, eq: typeof import('drizzle-orm').eq;
  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ vacationDays } = await import('./schema'));
    ({ applyVacationRange } = await import('./api'));
    ({ and, eq } = await import('drizzle-orm'));
    migrate();
  });
  afterAll(() => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

  it('marks every day in the range and is idempotent', () => {
    applyVacationRange('u1', '2026-07-10', '2026-07-12', true);
    applyVacationRange('u1', '2026-07-10', '2026-07-12', true); // idempotent
    const rows = db.select().from(vacationDays).where(eq(vacationDays.userId, 'u1')).all();
    expect(rows.map((r) => r.date).sort()).toEqual(['2026-07-10', '2026-07-11', '2026-07-12']);
  });
  it('clears every day in the range', () => {
    applyVacationRange('u1', '2026-07-10', '2026-07-12', false);
    const rows = db.select().from(vacationDays).where(eq(vacationDays.userId, 'u1')).all();
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- range.endpoints`
Expected: FAIL — `applyVacationRange` is not exported.

- [ ] **Step 3: Write minimal implementation** (add to `server/src/api.ts`)

```ts
// near the top imports, add:
import { datesInclusive, MAX_RANGE_DAYS } from './range';

// exported so it is unit-testable without the HTTP layer:
export function applyVacationRange(userId: string, start: string, end: string, on: boolean) {
  const days = datesInclusive(start, end);
  if (on) {
    const now = Date.now();
    for (const date of days)
      db.insert(vacationDays).values({ id: newId(), userId, date, createdAt: now }).onConflictDoNothing().run();
  } else {
    for (const date of days)
      db.delete(vacationDays).where(and(eq(vacationDays.userId, userId), eq(vacationDays.date, date))).run();
  }
  return days;
}
export function applyRestRange(userId: string, start: string, end: string, on: boolean) {
  const days = datesInclusive(start, end);
  if (on) {
    const now = Date.now();
    for (const date of days)
      db.insert(restDays).values({ id: newId(), userId, date, createdAt: now }).onConflictDoNothing().run();
  } else {
    for (const date of days)
      db.delete(restDays).where(and(eq(restDays.userId, userId), eq(restDays.date, date))).run();
  }
  return days;
}

const rangeBody = z.object({ start: z.string().regex(DATE_RE), end: z.string().regex(DATE_RE) });
function rangeRoute(apply: (uid: string, s: string, e: string, on: boolean) => string[], on: boolean) {
  return async (c: any) => {
    const p = rangeBody.safeParse(await body(c));
    if (!p.success) return c.json({ error: 'invalid_input' }, 400);
    try {
      const days = apply(uid(c), p.data.start, p.data.end, on);
      return c.json({ ok: true, count: days.length });
    } catch {
      return c.json({ error: 'invalid_range' }, 400);
    }
  };
}
api.post('/vacation-days/range', rangeRoute(applyVacationRange, true));
api.delete('/vacation-days/range', rangeRoute(applyVacationRange, false));
api.post('/rest-days/range', rangeRoute(applyRestRange, true));
api.delete('/rest-days/range', rangeRoute(applyRestRange, false));
```

Note: place the `/range` routes **before** any `/:date` param routes so `range` is not captured as a `:date` param. (The existing delete route is `/vacation-days/:date`; `/vacation-days/range` must be registered first.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test -- range.endpoints`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full server suite (no regressions)**

Run: `npm --prefix server test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/api.ts server/src/range.endpoints.test.ts
git commit -m "feat(server): bulk vacation/rest range endpoints"
```

---

## Task 3: Client range hooks

**Files:**
- Modify: `client/src/lib/hooks.ts` (beside `useToggleVacationDay`/`useToggleRestDay`, ~lines 37-61)

**Interfaces:**
- Consumes: `api.post`, `api.del`, the `'vacation-days'` / `'rest-days'` query keys.
- Produces: `useSetVacationRange()` and `useSetRestRange()` → `useMutation` with variables `{ start: string; end: string; on: boolean }`.

- [ ] **Step 1: Add the hooks** (no new unit test — these are thin wrappers verified via Task 10's manual flow)

```ts
/** Mark or clear an inclusive date range as vacation (bulk). */
export function useSetVacationRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ start, end, on }: { start: string; end: string; on: boolean }) =>
      on ? api.post('/vacation-days/range', { start, end }) : api.del('/vacation-days/range', { start, end }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacation-days'] }),
  });
}
/** Mark or clear an inclusive date range as rest days (bulk). */
export function useSetRestRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ start, end, on }: { start: string; end: string; on: boolean }) =>
      on ? api.post('/rest-days/range', { start, end }) : api.del('/rest-days/range', { start, end }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rest-days'] }),
  });
}
```

- [ ] **Step 2: Confirm `api.del` accepts a body**

Run: `grep -n "del" client/src/lib/api.ts`
If `del` does not forward a JSON body, extend it to `del(path, body?)` matching `post`'s signature (the server reads the body via `body(c)`), or switch the DELETE range to a `POST` with `{on:false}`. Pick whichever keeps `api.ts` consistent; adjust the hook + Task 2 route verb to match.

- [ ] **Step 3: Build the client to typecheck**

Run: `npm --prefix client run build`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/hooks.ts client/src/lib/api.ts
git commit -m "feat(client): useSetVacationRange / useSetRestRange bulk hooks"
```

---

## Task 4: Slim navigation + drop Today/Month routes

**Files:**
- Modify: `client/src/features/Layout.tsx` (nav arrays, ~lines 9-37)
- Modify: `client/src/App.tsx` (routes ~lines 46-62; imports ~lines 11-15)
- Delete: `client/src/features/tasks/MonthCalendar.tsx`
- Delete: `client/src/features/tasks/TodayView.tsx` (done in Task 6 once its stat pills are relocated — here only remove the routes/nav)

**Interfaces:**
- Consumes: existing `WeekBoard`, `Dashboard`, `Timer`, `Progress`, `SettingsPage`.

- [ ] **Step 1: Edit `Layout.tsx` nav** — remove the Today (`/`) and Month (`/month`) entries from both the desktop sidebar group and the mobile bottom bar. Resulting links: Week, Habits, Timer, Progress, Settings.

- [ ] **Step 2: Edit `App.tsx` routes**

Replace the Today + Month route lines:
```tsx
// remove:  <Route path="/" element={<TodayView />} />
// remove:  <Route path="/month" element={<MonthCalendar />} />
// add (landing → Week):
<Route path="/" element={<Navigate to="/week" replace />} />
```
Remove the now-unused `TodayView` and `MonthCalendar` imports. **Do not touch** the `/timer`, `/timers*`, `/focus`, `/quick` route lines.

- [ ] **Step 3: Delete `MonthCalendar.tsx`**

```bash
git rm client/src/features/tasks/MonthCalendar.tsx
```

- [ ] **Step 4: Verify build (TodayView still imported until Task 6)**

Run: `npm --prefix client run build`
Expected: clean (TodayView import was removed; the file still exists but is unreferenced — fine until Task 6 deletes it).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/Layout.tsx client/src/App.tsx
git commit -m "feat(nav): drop Today and Month; land on Week"
```

---

## Task 5: Relocate today's stat pills to the Week header

**Files:**
- Modify: `client/src/features/tasks/WeekBoard.tsx` (header, ~lines 119-126; imports)

**Interfaces:**
- Consumes: `useSessions`, `useRestDays` (for `currentStreak`), `currentStreak`, `todaySummary` from `lib/stats`.

- [ ] **Step 1: Add the pills to the Week header**

In `WeekBoard`, fetch sessions + rest days and compute summary, then render three compact pills next to the "Week" title (copy the pill markup/colors from the old `TodayView` header: Flame streak, Timer sessions, Clock minutes):

```tsx
import { useTasks, useSaveTask, useToggleTask, useCalendarEvents, useSessions, useRestDays } from '../../lib/hooks';
import { currentStreak, todaySummary } from '../../lib/stats';
import { Flame, Timer as TimerIcon, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react';
// inside WeekBoard():
const { data: sessions = [] } = useSessions();
const { data: restDayRows = [] } = useRestDays();
const streak = currentStreak(sessions, undefined, new Set(restDayRows.map((r) => r.date)));
const summary = todaySummary(sessions);
// in the header, after the <h1>Week</h1>, render the 3 stat-pill spans (Flame/{streak}, TimerIcon/{summary.count}, Clock/{summary.minutes}).
```

- [ ] **Step 2: Build + visually confirm**

Run: `npm --prefix client run build`
Expected: clean. (Manual: `/week` header shows streak / sessions / minutes pills.)

- [ ] **Step 3: Commit**

```bash
git add client/src/features/tasks/WeekBoard.tsx
git commit -m "feat(week): surface today's streak/sessions/minutes pills in the Week header"
```

---

## Task 6: Single-slot run store with `taggedHabitId`

**Files:**
- Modify: `client/src/features/run/activeRunStore.ts` (`PersistedRun`, ~lines 11-23)
- Modify: `client/src/features/run/activeRunStore.test.ts`
- Delete: `client/src/features/tasks/TodayView.tsx`

**Interfaces:**
- Produces: `PersistedRun.taggedHabitId: string | null` (replaces `parentFocusId`).

- [ ] **Step 1: Update the persistence test** — in `activeRunStore.test.ts`, replace any `parentFocusId` usage with `taggedHabitId`, and add:

```ts
it('round-trips taggedHabitId through save/load', () => {
  saveRun('foreground', { spec: SPEC, startedAtEpoch: 1000, status: 'running', elapsedMs: 0, snapshotEpoch: 1000, taggedHabitId: 'habit-9' });
  expect(loadRun('foreground')?.taggedHabitId).toBe('habit-9');
});
```
(Reuse the file's existing `SPEC`/fixture; match its style.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix client test -- activeRunStore`
Expected: FAIL — `taggedHabitId` missing on the type.

- [ ] **Step 3: Implement** — in `activeRunStore.ts`, rename the `parentFocusId` field on `PersistedRun` to `taggedHabitId: string | null`; update `saveRun`/`loadRun` to read/write it. Remove the `'focus'` slot key from the `RunKey` union if present (single `'foreground'` key).

- [ ] **Step 4: Delete TodayView (pills now live in Week)**

```bash
git rm client/src/features/tasks/TodayView.tsx
```

- [ ] **Step 5: Run to verify pass**

Run: `npm --prefix client test -- activeRunStore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/run/activeRunStore.ts client/src/features/run/activeRunStore.test.ts
git commit -m "refactor(run): persist taggedHabitId; remove focus slot; delete TodayView"
```

---

## Task 7: One shared run + `setTag` in RunContext; delete the umbrella

**Files:**
- Modify: `client/src/features/run/RunContext.tsx`
- Modify: `client/src/features/run/ActiveRun.tsx` (logRun ~lines 55-75; props ~lines 21-38)
- Delete: `client/src/features/run/FocusRun.tsx`, `client/src/features/run/FocusBar.tsx`, `client/src/features/run/FocusStarter.tsx`
- Create: `client/src/features/run/attribution.ts`
- Test: `client/src/features/run/attribution.test.ts`

**Interfaces:**
- Produces (RunContext): `startRun(spec)`, `setTag(habitId: string | null): void`, `activeRun: { label: string; taggedHabitId: string | null; running: boolean } | null`.
- Produces: `attributedHabitId(taggedHabitId: string | null, specHabitId?: string | null): string | null`.

- [ ] **Step 1: Write the attribution test**

```ts
// client/src/features/run/attribution.test.ts
import { describe, expect, it } from 'vitest';
import { attributedHabitId } from './attribution';
describe('attributedHabitId', () => {
  it('prefers the live tag', () => expect(attributedHabitId('h2', 'h1')).toBe('h2'));
  it('falls back to the spec habit', () => expect(attributedHabitId(null, 'h1')).toBe('h1'));
  it('is null when neither set', () => expect(attributedHabitId(null, null)).toBeNull());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix client test -- attribution`
Expected: FAIL — missing module.

- [ ] **Step 3: Implement `attribution.ts`**

```ts
// client/src/features/run/attribution.ts
export function attributedHabitId(taggedHabitId: string | null, specHabitId?: string | null): string | null {
  return taggedHabitId ?? specHabitId ?? null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix client test -- attribution`
Expected: PASS.

- [ ] **Step 5: Rework `RunContext.tsx`** to a single slot:
  - Remove `FocusSlot`, `focus` state, `startFocus`, `focusActive`, `closeFocus`, the `<FocusRun/>` render, and the focus rehydrate branch.
  - The single run slot state gains `taggedHabitId: string | null`. Add `setTag(habitId)` that updates `taggedHabitId` on the current slot (and persists via the next `ActiveRun` snapshot). `startRun` seeds `taggedHabitId = spec.habitId ?? null`.
  - Context value: `{ startRun, setTag, activeRun }` where `activeRun = fg ? { label: fg.spec.label, taggedHabitId: fg.taggedHabitId, running: true } : null`.
  - Pass `taggedHabitId={fg.taggedHabitId}` to `<ActiveRun/>` (keep the `key={fg.key}` stable so the engine does not restart on re-tag).

- [ ] **Step 6: Rework `ActiveRun.tsx`**:
  - Replace the `parentFocusId` prop with `taggedHabitId`.
  - In `logRun`, set `habitId: attributedHabitId(taggedHabitId, spec.habitId)` (import from `./attribution`), and set `parentSessionId: null` (umbrella gone). Persist `taggedHabitId` (not `parentFocusId`) in the snapshot `saveRun('foreground', { ... taggedHabitId })`.
  - In `RunScreen`/`MiniPlayer` props, pass the tagged habit's display name if available (look it up via `useHabits()` by id) — render a small "▸ {name}" label and an "untag" control that calls a passed `onUntag` → `setTag(null)`. (Keep minimal; a text label + ✕ is enough.)

- [ ] **Step 7: Delete the umbrella files**

```bash
git rm client/src/features/run/FocusRun.tsx client/src/features/run/FocusBar.tsx client/src/features/run/FocusStarter.tsx
```

- [ ] **Step 8: Build + full client test**

Run: `npm --prefix client run build && npm --prefix client test`
Expected: build clean (no dangling imports of deleted files); all tests pass. Fix any remaining `parentFocusId` / `FocusStarter` / `startFocus` references the compiler flags (notably in `Dashboard.tsx` — handled next task; if the build fails there, proceed to Task 8 in the same task boundary).

- [ ] **Step 9: Commit**

```bash
git add -A client/src/features/run
git commit -m "feat(run): single shared run with habit tagging; remove focus umbrella"
```

---

## Task 8: Habits dashboard — tag-on-tap + Start focus

**Files:**
- Modify: `client/src/features/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes (RunContext): `startRun`, `setTag`, `activeRun`.

- [ ] **Step 1: Replace the FocusStarter import + usage.** Remove `import { FocusStarter }`. Add a small inline **"Start focus"** button in the header that calls `startRun` with a default Pomodoro spec:

```tsx
import { useRun } from '../run/RunContext';
const { startRun, setTag, activeRun } = useRun();
const POMODORO_DEFAULT = { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 };
// Build a focus-block RunSpec inline (mirror Timer.tsx's FocusBlockBuilder.start():
// type:'interval', trackMode:'focus', phases via buildPomodoroPhases(POMODORO_DEFAULT, 'Focus block', prep)).
function startFocus() {
  const prep = settings?.prepSeconds ?? 5;
  const phases = buildPomodoroPhases(POMODORO_DEFAULT, 'Focus block', prep);
  startRun({ type: 'interval', config: { prepSeconds: prep, sets: POMODORO_DEFAULT.rounds, intervals: [], cooldownSeconds: 0 }, label: 'Focus block', plannedSeconds: workSeconds(phases), phases, trackMode: 'focus' });
}
```
Import `buildPomodoroPhases`, `workSeconds` from `../../engine/buildPhases`.

- [ ] **Step 2: Tag-on-tap when a run is active.** Add a banner shown when `activeRun?.running`:

```tsx
{activeRun?.running && (
  <div className="card flex items-center justify-between p-3 text-sm">
    <span>Focus running — tap a habit to count it toward one{activeRun.taggedHabitId ? ` (now: ${habits.find(h => h.id === activeRun.taggedHabitId)?.name ?? '…'})` : ''}.</span>
  </div>
)}
```
Change the habit-start handler so that when a run is active, tapping a habit re-tags instead of starting:

```tsx
function start(habit: Habit, min: number) {
  if (activeRun?.running) { setTag(habit.id); return; }       // tag the running block
  const prep = settings?.prepSeconds ?? 5;
  startRun({ type: 'simple', label: habit.name, habitId: habit.id, plannedSeconds: min * 60, config: { totalSeconds: min * 60, prepSeconds: prep } });
}
```

- [ ] **Step 3: Build + test**

Run: `npm --prefix client run build && npm --prefix client test`
Expected: clean + green (no more `FocusStarter`/`startFocus` references anywhere).

- [ ] **Step 4: Commit**

```bash
git add client/src/features/dashboard/Dashboard.tsx
git commit -m "feat(habits): tag the running focus block on habit tap; inline Start focus"
```

---

## Task 9: Range-selection state machine (pure)

**Files:**
- Create: `client/src/features/habits/rangeSelect.ts`
- Test: `client/src/features/habits/rangeSelect.test.ts`

**Interfaces:**
- Produces: `type RangeState = { pendingStart: string | null }`; `INITIAL_RANGE: RangeState`; `tapDay(state: RangeState, day: string, isMarked: boolean): { state: RangeState; commit: { start: string; end: string } | null; clearDay: string | null }`.

- [ ] **Step 1: Write the failing test**

```ts
// client/src/features/habits/rangeSelect.test.ts
import { describe, expect, it } from 'vitest';
import { INITIAL_RANGE, tapDay } from './rangeSelect';

describe('tapDay range state machine', () => {
  it('first tap on an unmarked day sets pending start, no commit', () => {
    const r = tapDay(INITIAL_RANGE, '2026-07-10', false);
    expect(r.state.pendingStart).toBe('2026-07-10');
    expect(r.commit).toBeNull();
    expect(r.clearDay).toBeNull();
  });
  it('second tap commits the inclusive range (ordered) and resets', () => {
    const a = tapDay(INITIAL_RANGE, '2026-07-10', false);
    const b = tapDay(a.state, '2026-07-12', false);
    expect(b.commit).toEqual({ start: '2026-07-10', end: '2026-07-12' });
    expect(b.state.pendingStart).toBeNull();
  });
  it('orders the range when end < start', () => {
    const a = tapDay(INITIAL_RANGE, '2026-07-12', false);
    const b = tapDay(a.state, '2026-07-10', false);
    expect(b.commit).toEqual({ start: '2026-07-10', end: '2026-07-12' });
  });
  it('tapping the pending-start day again cancels', () => {
    const a = tapDay(INITIAL_RANGE, '2026-07-10', false);
    const b = tapDay(a.state, '2026-07-10', false);
    expect(b.state.pendingStart).toBeNull();
    expect(b.commit).toBeNull();
  });
  it('tapping a marked day with no pending start requests a single-day clear', () => {
    const r = tapDay(INITIAL_RANGE, '2026-07-10', true);
    expect(r.clearDay).toBe('2026-07-10');
    expect(r.commit).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix client test -- rangeSelect`
Expected: FAIL — missing module.

- [ ] **Step 3: Implement**

```ts
// client/src/features/habits/rangeSelect.ts
export type RangeState = { pendingStart: string | null };
export const INITIAL_RANGE: RangeState = { pendingStart: null };

export function tapDay(state: RangeState, day: string, isMarked: boolean):
  { state: RangeState; commit: { start: string; end: string } | null; clearDay: string | null } {
  if (state.pendingStart === null) {
    if (isMarked) return { state, commit: null, clearDay: day };       // clear single marked day
    return { state: { pendingStart: day }, commit: null, clearDay: null }; // begin range
  }
  if (state.pendingStart === day) return { state: INITIAL_RANGE, commit: null, clearDay: null }; // cancel
  const [start, end] = [state.pendingStart, day].sort();
  return { state: INITIAL_RANGE, commit: { start, end }, clearDay: null };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix client test -- rangeSelect`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/habits/rangeSelect.ts client/src/features/habits/rangeSelect.test.ts
git commit -m "feat(habits): pure range-selection state machine"
```

---

## Task 10: Habit drill-down page (Overview + Month) + route shuffle

**Files:**
- Create: `client/src/features/habits/HabitDetail.tsx`
- Modify: `client/src/App.tsx` (habit routes only)
- Modify: `client/src/features/habits/HabitCard.tsx` (card body → detail; edit → `/edit`)

**Interfaces:**
- Consumes: `useHabits`, `useSessions`, `useVacationDays`, `useRestDays`, `useSetVacationRange`, `useSetRestRange` (Task 3); `currentStreak`/`goalStreak`/`effectiveGoal`/`todaysHabitSession` from `lib/stats`; `monthMatrix`, `keyToDate`, `addDaysKey`, `todayKey` from `lib/date`; `INITIAL_RANGE`, `tapDay` (Task 9).

- [ ] **Step 1: Route shuffle in `App.tsx`** (only the habit lines):

```tsx
<Route path="/habits/new" element={<HabitEditor />} />
<Route path="/habits/:id" element={<HabitDetail />} />
<Route path="/habits/:id/edit" element={<HabitEditor />} />
```
Add `import { HabitDetail } from './features/habits/HabitDetail';`. (`HabitEditor` import stays.)

- [ ] **Step 2: Point `HabitCard` at the detail page** — change the card-body click target to `/habits/:id` and the edit affordance (`editTo`) to `/habits/:id/edit`. (In `Dashboard.tsx` the card is created with `editTo={\`/habits/${h.id}\`}`; change that to `editTo={\`/habits/${h.id}/edit\`}` and add an `onOpen` that navigates to `/habits/${h.id}`, wired to the card body.)

- [ ] **Step 3: Build `HabitDetail.tsx`** — `useParams` for `id`; load habit; header with name + an Edit `<Link to={\`/habits/${id}/edit\`}>`; a tab switch `Overview | Month`.
  - **Overview tab:** streak (`goalStreak`/`currentStreak`), average minutes/day over logged days, the per-habit activity grid (reuse the grid component used by `HabitCard` from commit `373781d` — import it; if it is inline in `HabitCard`, extract it to `client/src/features/habits/HabitActivityGrid.tsx` and import in both), and a recent-days list (date · minutes · goal met using `effectiveGoal`).
  - **Month tab:** a calendar grid (`monthMatrix(year, month0, weekStart)`), prev/next month nav, each day cell shows activity + 🌴/🌙 markers from `useVacationDays`/`useRestDays`. A mode switch `[🌴 Vacation | 🌙 Rest]`. Day taps run through `tapDay` (Task 9): on `commit` call `useSetVacationRange`/`useSetRestRange` `mutate({ start, end, on: true })` for the active mode; on `clearDay` call the matching range hook with `{ start: day, end: day, on: false }`. Show the pending-start highlight and the global-scope note.

- [ ] **Step 4: Build + test**

Run: `npm --prefix client run build && npm --prefix client test`
Expected: clean + green.

- [ ] **Step 5: Manual verification** (local dev per repo recipe: `npm run dev`, login):
  - Click a habit card → lands on `/habits/:id` Overview; Edit button → `/habits/:id/edit` editor.
  - Month tab: tap Jul 10 then Jul 20 in Vacation mode → those days show 🌴; reload → still there (server persisted). Tap a single 🌴 day → clears it. Switch to Rest mode → paint 🌙 range.
  - A habit with a `vacationGoalMin` shows the lighter effective goal on a vacation day (existing behavior).

- [ ] **Step 6: Commit**

```bash
git add client/src/features/habits/HabitDetail.tsx client/src/features/habits/HabitCard.tsx client/src/features/habits/HabitActivityGrid.tsx client/src/features/dashboard/Dashboard.tsx client/src/App.tsx
git commit -m "feat(habits): per-habit drill-down with Overview + Month vacation/rest painting"
```

---

## Task 11: Docs + final sweep

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`** — set the feature/nav list to Week · Habits · Timer · Progress · Settings; remove Today/Month mentions; remove the stale "Quick Timer … in seconds" bullet; describe the one-timer focus + habit-tagging model and vacation/rest **ranges** in the habit drill-down. Keep the timer-page description generic so it does not contradict the `feat/unified-timer-page` effort.

- [ ] **Step 2: Full suite + build**

Run: `npm test && npm --prefix client run build`
Expected: server + client tests pass; client builds.

- [ ] **Step 3: Grep for dangling references**

Run: `grep -rn "TodayView\|MonthCalendar\|FocusStarter\|FocusRun\|FocusBar\|startFocus\|parentFocusId" client/src`
Expected: no matches (all migrated/removed).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for slim nav, focus tagging, vacation ranges"
```

---

## Self-review notes (coverage)

- Spec §1 nav → Tasks 4, 5, 6 (TodayView delete). §2 focus → Tasks 6, 7, 8. §3 drill-down → Task 10 (+9). §4 vacation/rest ranges → Tasks 1, 2, 3, 9, 10. §5 docs/tests → Task 11 (+ per-task tests).
- Coordination constraint (no Timer/TimerEditor edits; App.tsx limited to Today/Month/habits/landing lines) honored across Tasks 4 and 10.
- Type consistency: `taggedHabitId` used in store (Task 6), context/ActiveRun (Task 7), attribution (Task 7); `tapDay`/`INITIAL_RANGE` shared between Tasks 9 and 10; range hooks `{start,end,on}` shared between Tasks 3 and 10; server `applyVacationRange/applyRestRange/datesInclusive` shared between Tasks 1 and 2.
