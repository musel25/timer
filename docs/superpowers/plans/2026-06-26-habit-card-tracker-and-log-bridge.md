# Habit Card Tracker + Log Bridge — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the habit card a tracker + config + log surface (no timer-start), and add a one-tap bridge that logs the active timer's uncommitted elapsed time into a habit with lap-style reset.

**Architecture:** A small pure module (`activeElapsed.ts` + `logCheckpoint.ts`) computes the active run's *uncommitted* elapsed and records a per-run checkpoint; `RunContext` exposes `activeElapsedSec()` + `checkpointActive()`; `HabitCard` drops its Start affordances and promotes logging, pre-filling from the active timer; `Dashboard` wires the two together. No schema or API change.

**Tech Stack:** React + TypeScript (Vite), vitest (jsdom), localStorage persistence.

## Global Constraints

- No schema / `/api/sessions` change — habit progress is recorded only via the existing `onLog → buildManualSession` path.
- No run/playback engine change — the seam on `RunContext` is additive and read-only (plus a checkpoint write to its own localStorage key).
- Follow existing test conventions: pure logic is unit-tested with vitest; UI wiring is verified by `tsc` build + the green suite + manual run (the project has no component-test harness — do not add one).
- All shell commands run from the repo root `/home/musel/Github/timer`. The client lives in `client/`.

---

### Task 1: Uncommitted-elapsed logic + log checkpoint (pure, TDD)

**Files:**
- Create: `client/src/features/run/logCheckpoint.ts`
- Create: `client/src/features/run/activeElapsed.ts`
- Test: `client/src/features/run/activeElapsed.test.ts`

**Interfaces:**
- Consumes: `loadRun`, `liveElapsedMs`, `PersistedRun` from `activeRunStore.ts`.
- Produces:
  - `loadCheckpoint(): LogCheckpoint | null`, `saveCheckpoint(cp: LogCheckpoint | null): void`, `interface LogCheckpoint { runKey: string; loggedMs: number }`
  - `resolveActiveRun(): { slot: 'foreground' | 'focus'; run: PersistedRun; runKey: string } | null`
  - `uncommittedElapsedSec(now: number): number`
  - `checkpointActive(now: number): void`

- [ ] **Step 1: Write `logCheckpoint.ts`**

```ts
/**
 * Tracks how much of the active run's elapsed time has already been logged to a
 * habit, so the next log offers only the *uncommitted* remainder (lap behavior).
 * Keyed by run identity so it self-invalidates when the run changes. Persisted
 * to localStorage to survive a reload mid-lap.
 */
const KEY = 'timer_log_checkpoint';

export interface LogCheckpoint {
  /** Identity of the run this checkpoint belongs to (`fg:<startedAtEpoch>` or `focus:<focusId>`). */
  runKey: string;
  /** Active elapsed ms already logged to a habit at the last checkpoint. */
  loggedMs: number;
}

export function loadCheckpoint(): LogCheckpoint | null {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as LogCheckpoint | null) ?? null;
  } catch {
    return null;
  }
}

export function saveCheckpoint(cp: LogCheckpoint | null): void {
  try {
    if (cp) localStorage.setItem(KEY, JSON.stringify(cp));
    else localStorage.removeItem(KEY);
  } catch {
    // best-effort; private mode / quota
  }
}
```

- [ ] **Step 2: Write the failing test `activeElapsed.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { saveRun, type PersistedRun } from './activeRunStore';
import { saveCheckpoint } from './logCheckpoint';
import { resolveActiveRun, uncommittedElapsedSec, checkpointActive } from './activeElapsed';
import type { RunSpec } from '../../lib/types';

const spec: RunSpec = { type: 'simple', label: 'X', plannedSeconds: 3600, config: { totalSeconds: 3600, prepSeconds: 0 } };
const NOW = 2_000_000;

// A running snapshot whose live elapsed at NOW equals `sec` seconds (snapshot taken at NOW).
const running = (sec: number, over: Partial<PersistedRun> = {}): PersistedRun => ({
  spec,
  startedAtEpoch: 1_000_000,
  status: 'running',
  elapsedMs: sec * 1000,
  snapshotEpoch: NOW,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('uncommittedElapsedSec', () => {
  it('is 0 with no active run', () => {
    expect(uncommittedElapsedSec(NOW)).toBe(0);
  });
  it('returns full elapsed when nothing is logged yet', () => {
    saveRun('foreground', running(600));
    expect(uncommittedElapsedSec(NOW)).toBe(600);
  });
  it('prefers the foreground run over the focus umbrella', () => {
    saveRun('focus', running(1800, { focusId: 'f1' }));
    saveRun('foreground', running(120));
    expect(uncommittedElapsedSec(NOW)).toBe(120);
  });
  it('falls back to the focus umbrella when no foreground run', () => {
    saveRun('focus', running(300, { focusId: 'f1' }));
    expect(uncommittedElapsedSec(NOW)).toBe(300);
  });
  it('subtracts a checkpoint that matches the current run', () => {
    saveRun('foreground', running(600));
    saveCheckpoint({ runKey: 'fg:1000000', loggedMs: 360_000 });
    expect(uncommittedElapsedSec(NOW)).toBe(240);
  });
  it('ignores a checkpoint from a different (earlier) run', () => {
    saveRun('foreground', running(600, { startedAtEpoch: 1_500_000 }));
    saveCheckpoint({ runKey: 'fg:1000000', loggedMs: 360_000 });
    expect(uncommittedElapsedSec(NOW)).toBe(600);
  });
});

describe('checkpointActive (lap reset)', () => {
  it('drives uncommitted elapsed to 0 right after a log', () => {
    saveRun('foreground', running(600));
    checkpointActive(NOW);
    expect(uncommittedElapsedSec(NOW)).toBe(0);
  });
  it('is a no-op when no run is active', () => {
    checkpointActive(NOW);
    expect(localStorage.getItem('timer_log_checkpoint')).toBeNull();
  });
});

describe('resolveActiveRun', () => {
  it('returns null when the only run is done', () => {
    saveRun('foreground', running(600, { status: 'done' }));
    expect(resolveActiveRun()).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test, verify it fails** — `cd client && npx vitest run src/features/run/activeElapsed.test.ts` → FAIL (`activeElapsed` not found).

- [ ] **Step 4: Write `activeElapsed.ts`**

```ts
import { loadRun, liveElapsedMs, type PersistedRun } from './activeRunStore';
import { loadCheckpoint, saveCheckpoint } from './logCheckpoint';

/** Stable identity for a run snapshot, used to scope log checkpoints to one run. */
function runKeyOf(slot: 'foreground' | 'focus', run: PersistedRun): string {
  return slot === 'foreground' ? `fg:${run.startedAtEpoch}` : `focus:${run.focusId}`;
}

/**
 * The run a habit log should attribute time to: the foreground timer if one is
 * live, else the background focus umbrella, else none ("live" = not done).
 */
export function resolveActiveRun(): { slot: 'foreground' | 'focus'; run: PersistedRun; runKey: string } | null {
  const fg = loadRun('foreground');
  if (fg && fg.status !== 'done') return { slot: 'foreground', run: fg, runKey: runKeyOf('foreground', fg) };
  const focus = loadRun('focus');
  if (focus && focus.status !== 'done') return { slot: 'focus', run: focus, runKey: runKeyOf('focus', focus) };
  return null;
}

/** Uncommitted elapsed seconds of the active run (live elapsed minus already-logged). 0 if none. */
export function uncommittedElapsedSec(now: number): number {
  const active = resolveActiveRun();
  if (!active) return 0;
  const elapsed = liveElapsedMs(active.run, now);
  const cp = loadCheckpoint();
  const logged = cp && cp.runKey === active.runKey ? cp.loggedMs : 0;
  return Math.max(0, (elapsed - logged) / 1000);
}

/** Mark the active run's current elapsed as logged to a habit (lap reset); no-op if no run. */
export function checkpointActive(now: number): void {
  const active = resolveActiveRun();
  if (!active) return;
  saveCheckpoint({ runKey: active.runKey, loggedMs: liveElapsedMs(active.run, now) });
}
```

- [ ] **Step 5: Run the test, verify it passes** — `cd client && npx vitest run src/features/run/activeElapsed.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/run/logCheckpoint.ts client/src/features/run/activeElapsed.ts client/src/features/run/activeElapsed.test.ts
git commit -m "feat(run): uncommitted-elapsed + log checkpoint for timer→habit logging"
```

---

### Task 2: Expose the seam on `RunContext`

**Files:**
- Modify: `client/src/features/run/RunContext.tsx`

**Interfaces:**
- Consumes: `uncommittedElapsedSec`, `checkpointActive` from `activeElapsed.ts`.
- Produces (added to `useRun()` value): `activeElapsedSec: () => number`, `checkpointActive: () => void`.

- [ ] **Step 1: Add import** — at top of `RunContext.tsx`, after the `activeRunStore` import:

```ts
import { uncommittedElapsedSec, checkpointActive as checkpointActiveRun } from './activeElapsed';
```

- [ ] **Step 2: Extend the context type** — replace the `RunCtx` interface body:

```ts
interface RunCtx {
  /** Start a foreground timer (ad-hoc). Tagged to the active focus session, if any. */
  startRun: (spec: RunSpec) => void;
  /** Start the background focus "umbrella" countdown. */
  startFocus: (minutes: number, label?: string) => void;
  focusActive: boolean;
  /** Uncommitted elapsed seconds of the active run (foreground > focus > 0). */
  activeElapsedSec: () => number;
  /** Mark the active run's elapsed as logged to a habit (lap reset). */
  checkpointActive: () => void;
}
```

- [ ] **Step 3: Update the default context value** — replace the `createContext` call:

```ts
const Ctx = createContext<RunCtx>({
  startRun: () => {},
  startFocus: () => {},
  focusActive: false,
  activeElapsedSec: () => 0,
  checkpointActive: () => {},
});
```

- [ ] **Step 4: Add the callbacks + provide them** — after the `startFocus` `useCallback` (before `closeFg`):

```ts
  const activeElapsedSec = useCallback(() => uncommittedElapsedSec(Date.now()), []);
  const checkpointActive = useCallback(() => checkpointActiveRun(Date.now()), []);
```

Then update the provider value:

```tsx
    <Ctx.Provider value={{ startRun, startFocus, focusActive: !!focus, activeElapsedSec, checkpointActive }}>
```

- [ ] **Step 5: Verify build** — `cd client && npm run build` → succeeds (no type errors).

- [ ] **Step 6: Commit**

```bash
git add client/src/features/run/RunContext.tsx
git commit -m "feat(run): expose activeElapsedSec + checkpointActive on RunContext"
```

---

### Task 3: Habit card — drop Start, promote Log, pre-fill from timer

**Files:**
- Modify: `client/src/features/habits/HabitCard.tsx`

**Interfaces:**
- Consumes: `suggestedMin?: () => number`, `onCheckpoint?: () => void` (new props); existing `onLog?`.
- Produces: card with no timer-start; `onStart` prop removed.

- [ ] **Step 1: Fix the lucide import (line 3)** — drop `ChevronDown`, `ListPlus`, `Play`; add `Plus`:

```ts
import { Check, EyeOff, Flame, Pencil, Plus, ShieldCheck } from 'lucide-react';
```

- [ ] **Step 2: Update the doc comment + props** — replace the JSDoc block and the props destructure/types (lines 9-41) so `onStart` is gone and the two new props exist:

```ts
/**
 * A habit as a colorful card — a tracker + config + log surface (it no longer
 * starts timers; timing lives on the Timer page). Time habits show a primary
 * "Log time" action plus today's progress toward the daily goal (minutes).
 * When a timer/focus block is running, opening the log pre-fills with its
 * uncommitted minutes (`suggestedMin`) and a successful log checkpoints it
 * (`onCheckpoint`, the lap reset). Abstinence habits ('abstain' kind) instead
 * show an end-of-day "stayed off today" toggle and a clean-day streak. Pass
 * `onHide` for the Today hide control, `editTo` for an edit link, `onLog` for
 * logging, and the abstain trio (`markedToday`, `streak`, `onToggle`).
 */
export function HabitCard({
  habit,
  minutesToday,
  onLog,
  suggestedMin,
  onCheckpoint,
  onHide,
  editTo,
  markedToday = false,
  streak = 0,
  goalMin,
  onToggle,
}: {
  habit: Habit;
  minutesToday: number;
  onLog?: (h: Habit, min: number) => void;
  suggestedMin?: () => number;
  onCheckpoint?: () => void;
  onHide?: (h: Habit) => void;
  editTo?: string;
  markedToday?: boolean;
  streak?: number;
  goalMin?: number | null; // effective goal for today; falls back to habit.dailyGoalMin
  onToggle?: (h: Habit) => void;
}) {
```

- [ ] **Step 3: Drop `pickLength` state, keep the rest** — in the state block (lines 45-49) remove the `pickLength` line so it reads:

```ts
  const durations = habit.durations?.length ? habit.durations : [10];
  const defaultMin = habit.defaultDurationMin ?? durations[0];
  const [logging, setLogging] = useState(false);
  const [customMin, setCustomMin] = useState(String(defaultMin));
```

- [ ] **Step 4: Add `openLog`, update `log` to checkpoint** — replace the `log` function (lines 51-56):

```ts
  function openLog() {
    setLogging((v) => {
      const next = !v;
      if (next && suggestedMin) {
        const s = Math.round(suggestedMin());
        if (s > 0) setCustomMin(String(s));
      }
      return next;
    });
  }

  function log(min: number) {
    if (!onLog || !Number.isFinite(min) || min <= 0) return;
    onLog(habit, min);
    onCheckpoint?.();
    setLogging(false);
    setCustomMin(String(defaultMin));
  }
```

- [ ] **Step 5: Remove the header `ListPlus` toggle** — delete the whole `{onLog && habit.kind !== 'abstain' && (…ListPlus…)}` block (old lines 70-79). The edit/hide controls in the header stay.

- [ ] **Step 6: Replace the Start row with a primary "Log time" button** — replace the time-habit body (old lines 128-168, the `<div className="flex gap-1.5">…</div>` Start block and the `pickLength` length-picker block) with:

```tsx
      {onLog && (
        <button
          onClick={openLog}
          aria-label="Log time"
          className="chip w-full justify-center gap-1.5 py-2 font-medium"
          style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
        >
          <Plus size={14} /> Log time
        </button>
      )}
```

- [ ] **Step 7: Update the log-panel heading** — in the `{onLog && logging && (…)}` panel, change the heading text from `Log without a timer` to:

```tsx
          <div className="mb-1.5 text-xs text-slate-400">Log time</div>
```

- [ ] **Step 8: Verify build** — `cd client && npm run build` → succeeds.

- [ ] **Step 9: Commit**

```bash
git add client/src/features/habits/HabitCard.tsx
git commit -m "feat(habits): card is tracker+config+log, no timer start; log pre-fills from active timer"
```

---

### Task 4: Dashboard — wire elapsed + checkpoint, drop start

**Files:**
- Modify: `client/src/features/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `activeElapsedSec`, `checkpointActive` from `useRun()`.
- Produces: cards rendered with `suggestedMin` + `onCheckpoint`, no `onStart`.

- [ ] **Step 1: Update the `useRun()` destructure (line 20)**:

```ts
  const { activeElapsedSec, checkpointActive } = useRun();
```

- [ ] **Step 2: Delete the `start` function** — remove the whole `function start(habit, min) {…}` block (old lines 36-45). `settings` is still used elsewhere (effectiveGoal/prep not needed now); if `settings` becomes unused, remove its hook + the `useSettings` import. (After this change `settings` is unused — remove `const { data: settings } = useSettings();` on line 17 and drop `useSettings` from the import on line 3.)

- [ ] **Step 3: Update the card render (old lines 54-67)** — drop `onStart`, add the two new props:

```tsx
  const card = (h: Habit) => (
    <HabitCard
      key={h.id}
      habit={h}
      minutesToday={today.minutesByHabit[h.id] ?? 0}
      onLog={log}
      suggestedMin={() => Math.round(activeElapsedSec() / 60)}
      onCheckpoint={checkpointActive}
      editTo={`/habits/${h.id}`}
      markedToday={today.doneHabitIds.has(h.id)}
      streak={streakFor(h)}
      goalMin={effectiveGoal(h, startOfToday(), vacationDays)}
      onToggle={toggleAbstain}
    />
  );
```

- [ ] **Step 4: Update the empty-today hero copy (old line 78)** — the `else` branch no longer references durations:

```tsx
            {today.count > 0 ? `Today · ${today.count} done · ${today.minutes} min` : 'Nothing logged yet today'}
```

- [ ] **Step 5: Verify build** — `cd client && npm run build` → succeeds (confirms no dangling `onStart`/`start`/`settings`/`startRun` references).

- [ ] **Step 6: Commit**

```bash
git add client/src/features/dashboard/Dashboard.tsx
git commit -m "feat(today): log into habits from the active timer; remove per-card timer start"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run the whole suite** — `cd client && npm test` → all green (incl. new `activeElapsed.test.ts`, unchanged `activeRunStore.test.ts`).
- [ ] **Step 2: Build** — `cd client && npm run build` → succeeds.
- [ ] **Step 3: Manual smoke (per local-dev recipe)**:
  - Habit card shows **Log time** (no Start), progress bar + streak intact.
  - With no timer: Log a typed amount → habit progress increases.
  - Start a Timer-page timer → wait → open Log on a habit → pre-filled ~elapsed → confirm logs it; timer keeps running, uncommitted resets to 0.
  - Log a second habit after another stretch → only the new stretch logs (no double-count).
  - Abstain habit still shows only the stayed-off toggle.

## Self-Review notes

- **Spec coverage:** §1 card→tracker (Task 3), §2 log bridge + lap (Tasks 1/3/4), §3 seam (Tasks 1/2), §4 data flow / dead `RunSpec.habitId` start path (Task 4 removes the only caller). Refinement vs spec §3: the checkpoint lives in a dedicated `logCheckpoint` localStorage key rather than inside the run snapshot — same intent (survives reload), but isolates the seam from the engine so `activeRunStore.ts`/`ActiveRun`/`FocusRun` need no change.
- **No new component-test harness** — UI tasks verified by `tsc` build + suite + manual, matching the repo's pure-logic test convention.
