# Ten-Minute Blocks & Goal-Based Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-habit duration chips with a single 10-minute-block button (+10 chaining), goal-as-blocks segmented tracking, Work/Study-tagged focus sessions, and a two-mode Timer page (Focus block + plain Timer) with savable presets and collapsible settings.

**Architecture:** React 18 + TanStack Query client (`client/`), Hono + Drizzle/SQLite server (`server/`). No schema migration: goals keep using `habits.daily_goal_min` (stored as blocks×10), the Work/Study tag rides in `sessions.note` (`'work'`/`'study'`), and Focus-block presets reuse the `timers` table with a new `type: 'pomodoro'`.

**Tech Stack:** TypeScript, React, vitest (client tests in `client/src/lib/*.test.ts`), zod (server input validation), Tailwind classes (`chip`, `card`, `btn-accent`, `btn-outline`).

**Spec:** `docs/superpowers/specs/2026-06-10-ten-minute-blocks-and-goal-tracking-design.md`

**Conventions for every task:** run commands from the repo root unless stated. After each commit, run `git push`. The client typecheck is `npm run typecheck` inside `client/`; client tests are `npm test` inside `client/`.

**Design deviation locked in:** the spec said the Work/Study tag is stored in the session `label`; we use `sessions.note` instead so `label` keeps holding the user's task text. The spec file is updated in Task 4.

---

### Task 1: Stats helpers (blocks, goal streak, focus buckets)

**Files:**
- Modify: `client/src/lib/stats.ts`
- Test: `client/src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing tests**

In `client/src/lib/stats.test.ts`, update the import line and the `todaySummary` describe block, and add two new describe blocks:

```ts
import { currentStreak, focusMinutesByTag, goalBlocks, goalStreak, todaySummary } from './stats';
```

Replace the existing `describe('todaySummary', …)` with:

```ts
describe('todaySummary', () => {
  it('aggregates completed sessions and counts 10-min blocks', () => {
    const noon = startOfToday() + 12 * 3600_000;
    const s = [
      session(noon, { habitId: 'h1', plannedSeconds: 600, actualSeconds: 600 }),
      session(noon + 3600_000, { habitId: 'h1', plannedSeconds: 600, actualSeconds: 600 }),
      session(noon + 7200_000, { habitId: 'h2', plannedSeconds: 1500, actualSeconds: 1500 }), // legacy 25-min session
      session(addDays(noon, -1), { habitId: 'h1' }), // yesterday — excluded
    ];
    const t = todaySummary(s);
    expect(t.count).toBe(3);
    expect(t.minutes).toBe(45);
    expect(t.doneHabitIds.has('h1')).toBe(true);
    expect(t.blocksByHabit['h1']).toBe(2);
    expect(t.blocksByHabit['h2']).toBe(2); // floor(25 / 10)
  });
});

describe('goalBlocks', () => {
  it('converts goal minutes to blocks', () => {
    expect(goalBlocks(30)).toBe(3);
    expect(goalBlocks(25)).toBe(3); // rounds
    expect(goalBlocks(5)).toBe(1); // at least one block when a goal exists
    expect(goalBlocks(null)).toBeNull();
    expect(goalBlocks(0)).toBeNull();
  });
});

describe('goalStreak', () => {
  const noon = startOfToday() + 12 * 3600_000;

  it('counts consecutive days the goal was met', () => {
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 1200 }), // 2 blocks today
      session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 1200 }),
      session(addDays(noon, -2), { habitId: 'h1', actualSeconds: 600 }), // only 1 block — goal missed
    ];
    expect(goalStreak(s, 'h1', 20)).toBe(2);
  });

  it('does not break the streak when today is not yet met', () => {
    const s = [session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 1200 })];
    expect(goalStreak(s, 'h1', 20)).toBe(1);
  });

  it('requires at least one block per day when there is no goal', () => {
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 600 }),
      session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 300 }), // half a block — breaks
    ];
    expect(goalStreak(s, 'h1', null)).toBe(1);
  });

  it('ignores other habits and incomplete sessions', () => {
    const s = [
      session(noon, { habitId: 'h2', actualSeconds: 1200 }),
      session(noon, { habitId: 'h1', actualSeconds: 1200, completed: false }),
    ];
    expect(goalStreak(s, 'h1', 10)).toBe(0);
  });
});

describe('focusMinutesByTag', () => {
  const noon = startOfToday() + 12 * 3600_000;

  it('buckets habit-less sessions by note tag', () => {
    const s = [
      session(noon, { note: 'work', actualSeconds: 1500 }),
      session(noon, { note: 'study', actualSeconds: 600 }),
      session(noon, { note: null, actualSeconds: 300 }), // legacy / plain timer
      session(noon, { habitId: 'h1', note: 'work', actualSeconds: 600 }), // habit session — excluded
      session(addDays(noon, -10), { note: 'work', actualSeconds: 600 }), // out of range
    ];
    const f = focusMinutesByTag(s, startOfToday());
    expect(Math.round(f.work)).toBe(25);
    expect(Math.round(f.study)).toBe(10);
    expect(Math.round(f.other)).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npm test -- stats`
Expected: FAIL — `focusMinutesByTag`, `goalBlocks`, `goalStreak` are not exported; `blocksByHabit` undefined.

- [ ] **Step 3: Implement in `client/src/lib/stats.ts`**

Replace the `TodaySummary` interface and `todaySummary` function with:

```ts
export interface TodaySummary {
  count: number;
  minutes: number;
  doneHabitIds: Set<string>;
  minutesByHabit: Record<string, number>;
  blocksByHabit: Record<string, number>; // completed 10-min blocks per habit
}

export function todaySummary(sessions: Session[]): TodaySummary {
  const t0 = startOfToday();
  const t1 = addDays(t0, 1);
  const s = sessions.filter((x) => x.startedAt >= t0 && x.startedAt < t1 && x.completed);
  const doneHabitIds = new Set<string>();
  const minutesByHabit: Record<string, number> = {};
  let minutes = 0;
  for (const x of s) {
    minutes += x.actualSeconds / 60;
    if (x.habitId) {
      doneHabitIds.add(x.habitId);
      minutesByHabit[x.habitId] = (minutesByHabit[x.habitId] ?? 0) + x.actualSeconds / 60;
    }
  }
  const blocksByHabit: Record<string, number> = {};
  for (const [id, min] of Object.entries(minutesByHabit)) blocksByHabit[id] = Math.floor(min / 10);
  return { count: s.length, minutes: Math.round(minutes), doneHabitIds, minutesByHabit, blocksByHabit };
}
```

(The `doneChips` field is deleted; its only consumers are updated in Task 2.)

Append at the end of the file:

```ts
/** A habit's daily goal converted to 10-minute blocks, or null when it has no goal. */
export function goalBlocks(dailyGoalMin: number | null): number | null {
  return dailyGoalMin ? Math.max(1, Math.round(dailyGoalMin / 10)) : null;
}

/**
 * Consecutive days (ending today, or yesterday when today isn't met yet) on
 * which the habit completed `goalBlocks` blocks — or at least one block when
 * it has no goal.
 */
export function goalStreak(sessions: Session[], habitId: string, dailyGoalMin: number | null): number {
  const need = goalBlocks(dailyGoalMin) ?? 1;
  const minByDay: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.completed || s.habitId !== habitId) continue;
    const k = dayKey(s.startedAt);
    minByDay[k] = (minByDay[k] ?? 0) + s.actualSeconds / 60;
  }
  const met = (ts: number) => Math.floor((minByDay[dayKey(ts)] ?? 0) / 10) >= need;
  let cursor = startOfToday();
  if (!met(cursor)) {
    cursor = addDays(cursor, -1);
    if (!met(cursor)) return 0;
  }
  let streak = 0;
  while (met(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export type FocusTag = 'work' | 'study' | 'other';

/** Minutes of habit-less (focus/timer) sessions since `fromTs`, bucketed by the Work/Study tag in `note`. */
export function focusMinutesByTag(sessions: Session[], fromTs: number): Record<FocusTag, number> {
  const out: Record<FocusTag, number> = { work: 0, study: 0, other: 0 };
  for (const s of sessions) {
    if (s.habitId || s.startedAt < fromTs) continue;
    const tag: FocusTag = s.note === 'work' ? 'work' : s.note === 'study' ? 'study' : 'other';
    out[tag] += s.actualSeconds / 60;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npm test -- stats`
Expected: PASS (all stats tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/stats.ts client/src/lib/stats.test.ts
git commit -m "feat(stats): block counting, goal-met streaks, work/study focus buckets"
git push
```

(The client typecheck will fail until Task 2 removes the `doneChips` consumers — that's expected; Task 2 commits restore it.)

---

### Task 2: BlockBar component + one-button HabitCard

**Files:**
- Create: `client/src/components/BlockBar.tsx`
- Modify: `client/src/features/habits/HabitCard.tsx`
- Modify: `client/src/features/dashboard/Dashboard.tsx:56,68` (HabitCard call sites + header copy)
- Modify: `client/src/features/tasks/TodayView.tsx:97` (HabitCard call site)

- [ ] **Step 1: Create `client/src/components/BlockBar.tsx`**

```tsx
import { gradient } from '../lib/palette';

/**
 * Segmented daily-goal bar: `goal` segments, the first `done` filled in the
 * habit's color. The count label can exceed the goal (e.g. 4/3).
 */
export function BlockBar({ done, goal, rgb }: { done: number; goal: number; rgb: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: goal }).map((_, i) => (
          <span
            key={i}
            className="h-2 flex-1 rounded-full"
            style={i < done ? { backgroundImage: gradient(rgb, 1, 0.7) } : { backgroundColor: 'rgb(var(--ink-700))' }}
          />
        ))}
      </div>
      <span className={`text-xs tabular-nums ${done >= goal ? 'font-semibold' : 'text-slate-400'}`} style={done >= goal ? { color: `rgb(${rgb})` } : undefined}>
        {done}/{goal}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the bottom half of `HabitCard.tsx`**

Replace the whole file body so the props change from `doneChips: Set<string>` to `blocksToday: number` and the chips row becomes one button + bar. Full new file:

```tsx
import { Link } from 'react-router-dom';
import { EyeOff, Pencil, Play } from 'lucide-react';
import type { Habit } from '../../lib/types';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { goalBlocks } from '../../lib/stats';
import { BlockBar } from '../../components/BlockBar';

/**
 * A habit as a colorful card: category-tinted icon chip, name, a single
 * "Start · 10 min" button, and today's block progress. Shared by the Today
 * dashboard and the Habits page. Pass `onHide` for the Today hide-for-today
 * control, or `editTo` for an edit link.
 */
export function HabitCard({
  habit,
  blocksToday,
  onStart,
  onHide,
  editTo,
}: {
  habit: Habit;
  blocksToday: number;
  onStart: (h: Habit, min: number) => void;
  onHide?: (h: Habit) => void;
  editTo?: string;
}) {
  const color = categoryColor(habit.id);
  const goal = goalBlocks(habit.dailyGoalMin);
  return (
    <div className="card group relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: gradient(color.rgb) }} />
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ backgroundImage: gradient(color.rgb), boxShadow: `0 6px 14px ${tint(color.rgb, 0.4)}` }}
        >
          <HabitIcon name={habit.emoji} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{habit.name}</div>
          {habit.note && <div className="truncate text-xs text-slate-400">{habit.note}</div>}
        </div>
        {editTo && (
          <Link to={editTo} className="shrink-0 text-slate-500 opacity-0 transition hover:text-slate-200 group-hover:opacity-100" title="Edit">
            <Pencil size={15} />
          </Link>
        )}
        {onHide && (
          <button
            aria-label="Hide from today"
            title="Hide from today"
            onClick={() => onHide(habit)}
            className="shrink-0 text-slate-500 opacity-0 transition hover:text-slate-200 group-hover:opacity-100"
          >
            <EyeOff size={16} />
          </button>
        )}
      </div>
      <button
        onClick={() => onStart(habit, 10)}
        className="chip w-full justify-center gap-1.5 py-2 font-medium"
        style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
      >
        <Play size={13} fill="currentColor" /> Start · 10 min
      </button>
      {goal ? (
        <div className="mt-3">
          <BlockBar done={blocksToday} goal={goal} rgb={color.rgb} />
        </div>
      ) : blocksToday > 0 ? (
        <div className="mt-3 text-xs text-slate-400">
          {blocksToday} block{blocksToday === 1 ? '' : 's'} today
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Update the call sites**

In `client/src/features/dashboard/Dashboard.tsx`, both HabitCard usages (grouped at line 56 and ungrouped at line 68) become:

```tsx
<HabitCard key={h.id} habit={h} blocksToday={today.blocksByHabit[h.id] ?? 0} onStart={start} editTo={`/habits/${h.id}`} />
```

and the header hint at line 40 becomes:

```tsx
{today.count > 0 ? `Today · ${today.count} done · ${today.minutes} min` : 'Tap a habit to start a 10-minute block'}
```

In `client/src/features/tasks/TodayView.tsx:97`:

```tsx
<HabitCard key={h.id} habit={h} blocksToday={summary.blocksByHabit[h.id] ?? 0} onStart={startHabit} onHide={hideHabit} />
```

- [ ] **Step 4: Typecheck + tests**

Run: `cd client && npm run typecheck && npm test`
Expected: PASS (no remaining `doneChips` references).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BlockBar.tsx client/src/features/habits/HabitCard.tsx client/src/features/dashboard/Dashboard.tsx client/src/features/tasks/TodayView.tsx
git commit -m "feat(habits): single 10-min start button with segmented block progress"
git push
```

---

### Task 3: HabitEditor — goal in blocks, durations UI removed

**Files:**
- Modify: `client/src/features/habits/HabitEditor.tsx`

- [ ] **Step 1: Remove duration state/UI, convert goal to blocks**

In `client/src/features/habits/HabitEditor.tsx`:

1. Delete the state lines 22–23 (`durations`, `defaultMin`) and line 25 (`addVal`). Keep `goal` (line 24) — it now holds **blocks**.
2. In the `useEffect` (lines 27–36), delete `setDurations(...)` and `setDefaultMin(...)`; change the goal line to:

```ts
setGoal(existing.dailyGoalMin ? Math.round(existing.dailyGoalMin / 10) : 0);
```

3. Delete the `addDuration` and `removeDuration` functions (lines 38–44).
4. Replace `onSave` (lines 53–67) with:

```ts
async function onSave() {
  if (!name.trim()) return;
  await save.mutateAsync({
    id,
    name: name.trim(),
    emoji: icon,
    note: note.trim() || null,
    groupId,
    durations: [10],
    defaultDurationMin: 10,
    dailyGoalMin: goal > 0 ? goal * 10 : null,
    timerType: 'simple',
  });
  navigate('/');
}
```

5. Replace the whole "Durations" block (the `<div>` with label `Durations (minutes) · tap to set default`, lines 110–124) and the goal card (lines 126–128) with a single card:

```tsx
<div className="card p-4">
  <Stepper label="Daily goal (10-min blocks, 0 = none)" value={goal} onChange={setGoal} min={0} max={12} />
  {goal > 0 && (
    <p className="mt-2 text-xs text-slate-400">
      {goal} block{goal === 1 ? '' : 's'} = {goal * 10} min/day
    </p>
  )}
</div>
```

6. Update the lucide import (line 3) to `import { Plus } from 'lucide-react';` (`X` is no longer used; `Plus` is still used by the new-group button).

- [ ] **Step 2: Typecheck**

Run: `cd client && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/habits/HabitEditor.tsx
git commit -m "feat(habits): editor sets daily goal in 10-min blocks, drops durations list"
git push
```

---

### Task 4: Run tagging + "+10 more" finish screen

**Files:**
- Modify: `client/src/lib/types.ts:99-110` (RunSpec)
- Modify: `client/src/features/run/ActiveRun.tsx:32-49` (logRun)
- Modify: `client/src/features/run/RunScreen.tsx:43-54` (done view)
- Modify: `docs/superpowers/specs/2026-06-10-ten-minute-blocks-and-goal-tracking-design.md` (label → note deviation)

- [ ] **Step 1: Add the tag to RunSpec**

In `client/src/lib/types.ts`, inside `RunSpec` after the `trackMode` field, add:

```ts
  /** Work/Study tag for focus sessions; logged into the session's `note`. */
  tag?: 'work' | 'study';
```

- [ ] **Step 2: Log the tag**

In `client/src/features/run/ActiveRun.tsx` `logRun`, change `note: null,` to:

```ts
      note: spec.tag ?? null,
```

- [ ] **Step 3: Habit finish screen offers "+10 more"**

In `client/src/features/run/RunScreen.tsx`, replace the done-view button row (lines 50–53):

```tsx
          <div className="flex gap-3">
            <button className="btn-outline border-white/30 text-white" onClick={onAgain}><RotateCcw size={16} /> Again</button>
            <button className="btn-accent" onClick={onClose}>Done</button>
          </div>
```

with:

```tsx
          <div className="flex gap-3">
            {spec.habitId ? (
              <>
                <button className="btn-accent" onClick={onAgain}><RotateCcw size={16} /> +10 more</button>
                <button className="btn-outline border-white/30 text-white" onClick={onClose}>Done</button>
              </>
            ) : (
              <>
                <button className="btn-outline border-white/30 text-white" onClick={onAgain}><RotateCcw size={16} /> Again</button>
                <button className="btn-accent" onClick={onClose}>Done</button>
              </>
            )}
          </div>
```

(`onAgain` already closes the current run — which logs the finished block — and starts a fresh run with the same spec, so chained blocks each log their own session. No ActiveRun change needed for chaining.)

- [ ] **Step 4: Record the spec deviation**

In `docs/superpowers/specs/2026-06-10-ten-minute-blocks-and-goal-tracking-design.md`, in section 4 change the sentence

> The started run's session `label` is set to the tag.

to

> The started run's session `note` is set to the tag (`'work'`/`'study'`), keeping `label` free for the task text.

and in the "Data model" section change

> The Work/Study tag is stored in the existing `sessions.label` field (`'Work'` or `'Study'`)

to

> The Work/Study tag is stored in the existing `sessions.note` field (`'work'` or `'study'`)

- [ ] **Step 5: Typecheck + commit**

Run: `cd client && npm run typecheck`
Expected: PASS.

```bash
git add client/src/lib/types.ts client/src/features/run/ActiveRun.tsx client/src/features/run/RunScreen.tsx docs/superpowers/specs/2026-06-10-ten-minute-blocks-and-goal-tracking-design.md
git commit -m "feat(run): work/study tag on focus runs and +10-more habit finish screen"
git push
```

---

### Task 5: Pomodoro presets — server enum, client types, preset helpers

**Files:**
- Modify: `server/src/api.ts:73`
- Modify: `server/src/schema.ts:55` (comment only)
- Modify: `client/src/lib/types.ts:31,72-81`
- Modify: `client/src/lib/presets.ts`
- Modify: `client/src/features/timers/TimersLibrary.tsx:37`
- Modify: `client/src/features/timers/TimerEditor.tsx:33`

- [ ] **Step 1: Widen the server enum**

`server/src/api.ts:73`:

```ts
  type: z.enum(['simple', 'interval', 'pomodoro']),
```

`server/src/schema.ts:55` comment becomes `// 'simple' | 'interval' | 'pomodoro'`.

(The sessions input enum at `server/src/api.ts:195` stays `['simple', 'interval']` — pomodoro runs log as `type: 'interval'`.)

- [ ] **Step 2: Widen client types**

In `client/src/lib/types.ts`:

```ts
export type TimerType = 'simple' | 'interval';
/** Types storable as presets in the timers table. */
export type PresetType = TimerType | 'pomodoro';
```

and in `TimerPreset`:

```ts
export interface TimerPreset {
  id: string;
  name: string;
  type: PresetType;
  config: SimpleConfig | IntervalConfig | PomodoroConfig;
  sortOrder: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 3: Teach preset helpers about pomodoro**

Replace `client/src/lib/presets.ts` with:

```ts
import type { IntervalConfig, PomodoroConfig, RunSpec, SimpleConfig, TimerPreset } from './types';
import { buildPomodoroPhases, totalSeconds, workSeconds } from '../engine/buildPhases';

export function presetSeconds(p: TimerPreset): number {
  if (p.type === 'pomodoro') return totalSeconds(buildPomodoroPhases(p.config as PomodoroConfig, '', 0));
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return (c.prepSeconds ?? 0) + c.totalSeconds;
  }
  const c = p.config as IntervalConfig;
  const perSet = c.intervals.reduce((a, iv) => a + iv.seconds, 0);
  return (c.prepSeconds ?? 0) + c.sets * perSet + (c.cooldownSeconds ?? 0);
}

export function runSpecFromPreset(p: TimerPreset): RunSpec {
  if (p.type === 'pomodoro') {
    const cfg = p.config as PomodoroConfig;
    const phases = buildPomodoroPhases(cfg, '', 0);
    return {
      type: 'interval',
      config: { prepSeconds: 0, sets: cfg.rounds, intervals: [], cooldownSeconds: 0 },
      label: p.name,
      timerId: p.id,
      plannedSeconds: workSeconds(phases),
      phases,
      trackMode: 'focus',
    };
  }
  return {
    type: p.type,
    config: p.config as SimpleConfig | IntervalConfig,
    label: p.name,
    timerId: p.id,
    plannedSeconds: presetSeconds(p),
  };
}

export function describePreset(p: TimerPreset): string {
  if (p.type === 'pomodoro') {
    const c = p.config as PomodoroConfig;
    return `${c.rounds} × ${c.work}m / ${c.short}m`;
  }
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return `${Math.round(c.totalSeconds / 60)} min`;
  }
  const c = p.config as IntervalConfig;
  const work = c.intervals.find((i) => i.kind === 'work');
  const rest = c.intervals.find((i) => i.kind === 'rest');
  return `${c.sets} × (${work?.seconds ?? 0}s / ${rest?.seconds ?? 0}s)`;
}
```

- [ ] **Step 4: Guard the Timers library/editor**

`client/src/features/timers/TimersLibrary.tsx:37` — pomodoro presets are edited from the Timer page, so hide the Edit link for them:

```tsx
              {t.type !== 'pomodoro' && <Link to={`/timers/${t.id}`} className="hover:text-slate-300">Edit</Link>}
```

`client/src/features/timers/TimerEditor.tsx:33` — `setType` is typed `TimerType`, so skip pomodoro presets (they can't reach this page from the UI, but a typed guard keeps tsc happy):

```ts
    if (existing.type !== 'pomodoro') setType(existing.type);
```

- [ ] **Step 5: Typecheck, server tests, commit**

Run: `cd client && npm run typecheck && cd ../server && npm test`
Expected: PASS (if the server has no test script, `npm test` errors with "missing script" — then skip it).

```bash
git add server/src/api.ts server/src/schema.ts client/src/lib/types.ts client/src/lib/presets.ts client/src/features/timers/TimersLibrary.tsx client/src/features/timers/TimerEditor.tsx
git commit -m "feat(timers): pomodoro preset type across server enum, client types, preset helpers"
git push
```

---

### Task 6: Timer page rewrite — Focus block + plain Timer, presets, collapsible settings

**Files:**
- Rewrite: `client/src/features/timer/Timer.tsx`

- [ ] **Step 1: Replace `client/src/features/timer/Timer.tsx` entirely**

```tsx
import { Fragment, useEffect, useRef, useState } from 'react';
import { Pencil, Play, X } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useSaveTimer, useSettings, useTimers } from '../../lib/hooks';
import type { PomodoroConfig, SimpleConfig, TimerPreset } from '../../lib/types';
import { buildPomodoroPhases, totalSeconds, workSeconds } from '../../engine/buildPhases';
import { humanDuration } from '../../lib/time';
import { useRun } from '../run/RunContext';

const POMODORO_DEFAULTS: PomodoroConfig = { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 };

type Mode = 'focus' | 'timer';
type FocusTag = 'work' | 'study';

const TAG_KEY = 'timer_focus_tag';

/** Timer builder: Focus block (deep-work cycles, Work/Study-tagged) and a plain countdown Timer. */
export function Timer() {
  const [mode, setMode] = useState<Mode>('focus');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Timer</h1>
        <p className="mt-1 text-sm text-slate-300">Focus blocks &amp; simple timers</p>
      </header>

      <div className="flex gap-2">
        {(['focus', 'timer'] as Mode[]).map((m) => (
          <button key={m} className={`chip flex-1 ${mode === m ? 'chip-active' : ''}`} onClick={() => setMode(m)}>
            {m === 'focus' ? 'Focus block' : 'Timer'}
          </button>
        ))}
      </div>

      {mode === 'focus' ? <FocusBlockBuilder /> : <SimpleTimerBuilder />}
    </div>
  );
}

function PresetChips({
  presets,
  selectedId,
  onPick,
}: {
  presets: TimerPreset[];
  selectedId: string | null;
  onPick: (p: TimerPreset) => void;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button key={p.id} className={`chip ${selectedId === p.id ? 'chip-active' : ''}`} onClick={() => onPick(p)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

function EditToggle({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return (
    <button className="btn-outline shrink-0 px-3 py-2 text-sm" onClick={onToggle}>
      {editing ? <X size={14} /> : <Pencil size={14} />} {editing ? 'Close' : 'Edit'}
    </button>
  );
}

function FocusBlockBuilder() {
  const { startRun } = useRun();
  const { data: settings } = useSettings();
  const { data: timers = [] } = useTimers();
  const saveTimer = useSaveTimer();
  const presets = timers.filter((t) => !t.archived && t.type === 'pomodoro');

  const [task, setTask] = useState('');
  const [tag, setTag] = useState<FocusTag>(() => (localStorage.getItem(TAG_KEY) === 'study' ? 'study' : 'work'));
  const [cfg, setCfg] = useState<PomodoroConfig>(POMODORO_DEFAULTS);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !settings?.pomodoro) return;
    setCfg(settings.pomodoro);
    seeded.current = true;
  }, [settings?.pomodoro]);

  function pickTag(t: FocusTag) {
    setTag(t);
    localStorage.setItem(TAG_KEY, t);
  }
  function loadPreset(p: TimerPreset) {
    setCfg(p.config as PomodoroConfig);
    setPresetId(p.id);
  }
  function update(patch: Partial<PomodoroConfig>) {
    setCfg((c) => ({ ...c, ...patch }));
    setPresetId(null); // edited values are a custom config, not the preset
  }

  const totalFocus = cfg.work * cfg.rounds;
  const totalSpan = totalSeconds(buildPomodoroPhases(cfg, '', 0));

  function start() {
    const prep = settings?.prepSeconds ?? 5;
    const phases = buildPomodoroPhases(cfg, task.trim(), prep);
    startRun({
      type: 'interval',
      config: { prepSeconds: prep, sets: cfg.rounds, intervals: [], cooldownSeconds: 0 },
      label: task.trim() || 'Focus block',
      timerId: presetId,
      plannedSeconds: workSeconds(phases),
      phases,
      trackMode: 'focus',
      tag,
    });
  }

  function savePreset() {
    saveTimer.mutate({ name: `${cfg.work}/${cfg.short} × ${cfg.rounds}`, type: 'pomodoro', config: cfg });
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['work', 'study'] as FocusTag[]).map((t) => (
          <button key={t} className={`chip flex-1 capitalize ${tag === t ? 'chip-active' : ''}`} onClick={() => pickTag(t)}>
            {t}
          </button>
        ))}
      </div>

      <input
        className="input"
        placeholder="What are you working on? (optional)"
        value={task}
        onChange={(e) => setTask(e.target.value)}
      />

      <PresetChips presets={presets} selectedId={presetId} onPick={loadPreset} />

      <div className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {Array.from({ length: cfg.rounds }).map((_, i) => (
                <Fragment key={i}>
                  <span className="h-3.5 w-3.5 rounded-full bg-accent" title={`Focus ${i + 1}`} />
                  {i < cfg.rounds - 1 && (
                    <span
                      className={`h-1.5 w-5 rounded ${(i + 1) % cfg.longEvery === 0 ? 'bg-violet-500' : 'bg-blue-500'}`}
                      title={(i + 1) % cfg.longEvery === 0 ? 'Long break' : 'Short break'}
                    />
                  )}
                </Fragment>
              ))}
            </div>
            <div className="text-sm text-slate-400">
              {cfg.rounds} × {cfg.work}m focus = <span className="text-slate-200">{humanDuration(totalFocus * 60)} focus</span>
              {' · '}~{humanDuration(totalSpan)} total
            </div>
          </div>
          <EditToggle editing={editing} onToggle={() => setEditing((v) => !v)} />
        </div>

        {editing && (
          <div className="mt-4 space-y-3 border-t border-ink-600 pt-4">
            <Stepper label="Focus block" value={cfg.work} onChange={(v) => update({ work: v })} min={1} max={120} suffix="min" />
            <Stepper label="Short break" value={cfg.short} onChange={(v) => update({ short: v })} min={1} max={60} suffix="min" />
            <Stepper label="Long break" value={cfg.long} onChange={(v) => update({ long: v })} min={1} max={120} suffix="min" />
            <Stepper label="Long break every" value={cfg.longEvery} onChange={(v) => update({ longEvery: v })} min={1} max={12} suffix="blocks" />
            <Stepper label="Blocks this session" value={cfg.rounds} onChange={(v) => update({ rounds: v })} min={1} max={16} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className="btn-accent col-span-2" onClick={start}>
          <Play size={16} fill="currentColor" /> Start focus
        </button>
        <button className="btn-outline" onClick={savePreset} disabled={saveTimer.isPending}>
          Save preset
        </button>
      </div>
    </div>
  );
}

function SimpleTimerBuilder() {
  const { startRun } = useRun();
  const { data: timers = [] } = useTimers();
  const saveTimer = useSaveTimer();
  const presets = timers.filter((t) => !t.archived && t.type === 'simple');

  const [minutes, setMinutes] = useState(10);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function loadPreset(p: TimerPreset) {
    setMinutes(Math.round((p.config as SimpleConfig).totalSeconds / 60));
    setPresetId(p.id);
  }
  function update(v: number) {
    setMinutes(v);
    setPresetId(null);
  }

  function start() {
    const preset = presets.find((p) => p.id === presetId);
    startRun({
      type: 'simple',
      label: preset?.name ?? 'Timer',
      timerId: presetId,
      plannedSeconds: minutes * 60,
      config: { totalSeconds: minutes * 60, prepSeconds: 0 },
    });
  }

  function savePreset() {
    const config: SimpleConfig = { totalSeconds: minutes * 60, prepSeconds: 0 };
    saveTimer.mutate({ name: `${minutes} min`, type: 'simple', config });
  }

  return (
    <div className="space-y-5">
      <PresetChips presets={presets} selectedId={presetId} onPick={loadPreset} />

      <div className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-3xl font-bold tabular-nums">{humanDuration(minutes * 60)}</div>
          <EditToggle editing={editing} onToggle={() => setEditing((v) => !v)} />
        </div>
        {editing && (
          <div className="mt-4 border-t border-ink-600 pt-4">
            <Stepper label="Minutes" value={minutes} onChange={update} min={1} max={180} suffix="min" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className="btn-accent col-span-2" onClick={start}>
          <Play size={16} fill="currentColor" /> Start
        </button>
        <button className="btn-outline" onClick={savePreset} disabled={saveTimer.isPending}>
          Save preset
        </button>
      </div>
    </div>
  );
}
```

Notes for the implementer:
- The old `SimpleBuilder`/interval branch and the `useNavigate`/`useSaveSettings` imports are gone on purpose — the page no longer navigates away or writes `settings.pomodoro` (legacy default still seeds the steppers).
- `humanDuration(totalSpan)` takes seconds — the old code passed `totalSpan * 60` because it pre-divided; here `totalSpan` is already in seconds.

- [ ] **Step 2: Typecheck**

Run: `cd client && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/timer/Timer.tsx
git commit -m "feat(timer): two-mode page (focus block + plain timer) with presets and collapsible settings"
git push
```

---

### Task 7: Progress page — goal bars, today line, Focus section

**Files:**
- Modify: `client/src/features/stats/Progress.tsx`

- [ ] **Step 1: Rework the data + habits section + add Focus section**

In `client/src/features/stats/Progress.tsx`:

1. Update imports:

```tsx
import { currentStreak, focusMinutesByTag, goalBlocks, goalStreak, heatmap, minutesByHabitInRange, minutesInRange, todaySummary } from '../../lib/stats';
import { BlockBar } from '../../components/BlockBar';
```

2. Replace the `byHabit`/`ranked`/`maxMin` block (lines 27–32) with:

```tsx
  const summary = todaySummary(sessions);
  const byHabit = minutesByHabitInRange(sessions, weekAgo);
  const ranked = habits
    .filter((h) => !h.archived)
    .map((h) => ({
      h,
      weekMin: Math.round(byHabit[h.id] ?? 0),
      blocks: summary.blocksByHabit[h.id] ?? 0,
      goal: goalBlocks(h.dailyGoalMin),
      streak: goalStreak(sessions, h.id, h.dailyGoalMin),
    }))
    .sort((a, b) => b.weekMin - a.weekMin);

  const todayBlocks = Object.values(summary.blocksByHabit).reduce((a, b) => a + b, 0);
  const todayHabitMin = Math.round(Object.values(summary.minutesByHabit).reduce((a, b) => a + b, 0));

  const focusWeek = focusMinutesByTag(sessions, weekAgo);
  const focusToday = focusMinutesByTag(sessions, startOfToday());
  const focusRows = (
    [
      { key: 'work', label: 'Work', week: Math.round(focusWeek.work), today: Math.round(focusToday.work) },
      { key: 'study', label: 'Study', week: Math.round(focusWeek.study), today: Math.round(focusToday.study) },
      { key: 'other', label: 'Other focus', week: Math.round(focusWeek.other), today: Math.round(focusToday.other) },
    ] as const
  ).filter((r) => r.key !== 'other' || r.week > 0);
  const maxFocus = Math.max(1, ...focusRows.map((r) => r.week));
```

3. Replace the entire "By habit · this week" section (lines 72–99) with:

```tsx
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label">By habit · today vs goal</h2>
          <span className="text-xs text-slate-400">Today: {todayBlocks} block{todayBlocks === 1 ? '' : 's'} · {todayHabitMin} min</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ranked.map(({ h, weekMin, blocks, goal, streak }) => {
            const color = categoryColor(h.id);
            return (
              <div key={h.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ backgroundImage: gradient(color.rgb) }}>
                      <HabitIcon name={h.emoji} size={15} />
                    </span>
                    {h.name}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    {weekMin}m this week
                    {streak > 0 && <span className="flex items-center gap-0.5">· <Flame size={12} className="text-amber-500" />{streak}</span>}
                  </span>
                </div>
                {goal ? (
                  <BlockBar done={blocks} goal={goal} rgb={color.rgb} />
                ) : (
                  <div className="text-xs text-slate-400">{blocks} block{blocks === 1 ? '' : 's'} today · no goal set</div>
                )}
              </div>
            );
          })}
          {ranked.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No habits yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="label mb-2">Focus · this week</h2>
        <div className="card space-y-4 p-4">
          {focusRows.map((r) => (
            <div key={r.key}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span>{r.label}</span>
                <span className="text-slate-400">{r.week}m this week · {r.today}m today</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(r.week / maxFocus) * 100}%` }} />
              </div>
            </div>
          ))}
          {focusRows.every((r) => r.week === 0) && (
            <p className="text-center text-sm text-slate-500">No focus sessions this week yet.</p>
          )}
        </div>
      </section>
```

(`tint`/`solid` may become unused in this file after the edit — remove them from the palette import if tsc flags them. `currentStreak` is still used by the Day-streak stat card; the week/30-day cards are untouched.)

- [ ] **Step 2: Typecheck + tests**

Run: `cd client && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/stats/Progress.tsx
git commit -m "feat(progress): block-vs-goal habit bars, today summary, work/study focus section"
git push
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Build + all tests**

Run: `cd client && npm run typecheck && npm test && npm run build`
Expected: typecheck PASS, all vitest suites PASS, vite build succeeds.

Run: `cd server && npm test 2>/dev/null || true` and check whether the server has tests; if it does, they must PASS.

- [ ] **Step 2: Manual smoke test (dev servers)**

Start the app (server + client dev). Verify:
1. Habits page: each card shows one "Start · 10 min" button; tapping starts a 10-min run.
2. Finish a run (use the skip-forward control to fast-forward): finish screen shows "+10 more" + "Done"; "+10 more" starts a new block; both sessions appear in today's stats (2 blocks).
3. Habit editor: goal stepper in blocks; saving a 3-block goal then reopening shows 3.
4. Today/Habits cards: segmented bar fills 2/3 after two blocks of a 3-block goal.
5. Timer page: only "Focus block" and "Timer" modes; Work/Study toggle persists across reloads; settings collapsed by default and expand via Edit; "Save preset" creates a chip; tapping a chip loads it; starting a focus run then checking Progress shows minutes under Work or Study.
6. Timer mode: plain countdown with no phases besides the countdown; preset saves as "N min".
7. Progress page: habit bars are blocks-today vs goal; Focus section lists Work/Study rows.

- [ ] **Step 3: Final commit if any fixes were needed, then push**

```bash
git status   # confirm clean or commit fixes with a fix: message
git push
```
