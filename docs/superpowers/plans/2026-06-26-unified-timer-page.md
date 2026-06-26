# Unified Timer Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/timer` a single page where saved timers are the one-tap centerpiece, with a compact quick-start on top and one editor that builds all three timer types.

**Architecture:** Rewrite `Timer.tsx` into a unified page (quick-start row + saved-timers card grid that launches on tap), absorbing the orphaned `TimersLibrary` cards. Extend `TimerEditor` to handle the pomodoro ("Focus block") type alongside simple and interval, so building lives in exactly one place. Redirect the now-dead `/timers` route to `/timer`. No data-model, API, hook, or run/playback changes — `runSpecFromPreset` already launches any preset type.

**Tech Stack:** React 18, React Router 6, TanStack React Query, Tailwind CSS, lucide-react, Vitest. Client lives in `client/`.

## Global Constraints

- Client commands run with the `client/` prefix: typecheck `npm --prefix client run typecheck`, tests `npm --prefix client test`, build `npm --prefix client run build`.
- Do NOT touch the data model, `/timers` API, React Query hooks (`useTimers`/`useSaveTimer`/`useDeleteTimer`), or run/playback code (RunContext, FocusRun, ActiveRun, MiniPlayer).
- Reuse existing helpers verbatim: `runSpecFromPreset`, `describePreset`, `presetSeconds` (`lib/presets.ts`), `humanDuration` (`lib/time.ts`), `Stepper` (`components/Stepper.tsx`), and the `.card` / `.chip` / `.btn-accent` / `.btn-outline` CSS classes.
- Timer types: `simple` (countdown), `pomodoro` (Focus block), `interval` (HIIT). `PresetType = 'simple' | 'interval' | 'pomodoro'` (`lib/types.ts:33-35`).
- TDD where logic is pure; UI-only tasks gate on typecheck + existing test suite + manual verification (this codebase has no React component tests — do not add a component-test harness).

---

## Task 1: `timerTypeLabel` helper

A single source of truth for the human label of each timer type, shared by the cards (Task 3) and the editor toggle (Task 2). Pure function → real TDD.

**Files:**
- Create: `client/src/lib/timerMeta.ts`
- Test: `client/src/lib/timerMeta.test.ts`

**Interfaces:**
- Consumes: `PresetType` from `client/src/lib/types.ts`.
- Produces: `timerTypeLabel(type: PresetType): string` — returns `'Focus block'` for `'pomodoro'`, `'Timer'` for `'simple'`, `'Interval'` for `'interval'`.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/timerMeta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { timerTypeLabel } from './timerMeta';

describe('timerTypeLabel', () => {
  it('labels pomodoro as Focus block', () => {
    expect(timerTypeLabel('pomodoro')).toBe('Focus block');
  });
  it('labels simple as Timer', () => {
    expect(timerTypeLabel('simple')).toBe('Timer');
  });
  it('labels interval as Interval', () => {
    expect(timerTypeLabel('interval')).toBe('Interval');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- timerMeta`
Expected: FAIL — cannot resolve `./timerMeta` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `client/src/lib/timerMeta.ts`:

```ts
import type { PresetType } from './types';

/** Human label for a saved-timer type. Shared by the timer cards and the editor's type toggle. */
export function timerTypeLabel(type: PresetType): string {
  switch (type) {
    case 'pomodoro':
      return 'Focus block';
    case 'interval':
      return 'Interval';
    case 'simple':
      return 'Timer';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix client test -- timerMeta`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/timerMeta.ts client/src/lib/timerMeta.test.ts
git commit -m "feat(timer): add timerTypeLabel helper for timer type display"
```

---

## Task 2: Add Focus-block (pomodoro) support to the editor

Extend `TimerEditor` from two types to all three, so pomodoro is no longer the odd one edited inline. Fix the mislabeled type toggle (today `simple` is wrongly called "Focus block"). Navigate back to `/timer` on save/delete.

**Files:**
- Modify (full rewrite): `client/src/features/timers/TimerEditor.tsx`

**Interfaces:**
- Consumes: `timerTypeLabel` (Task 1); `useSaveTimer`, `useDeleteTimer`, `useTimers` (`lib/hooks.ts`); `Stepper`; `PHASE_COLORS` (`engine/buildPhases`); types `Interval`, `IntervalConfig`, `PomodoroConfig`, `PresetType`, `SimpleConfig` (`lib/types.ts`).
- Produces: a route component at `/timers/new` and `/timers/:id` that creates/edits `simple`, `interval`, and `pomodoro` presets and returns to `/timer`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `client/src/features/timers/TimerEditor.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useDeleteTimer, useSaveTimer, useTimers } from '../../lib/hooks';
import { PHASE_COLORS } from '../../engine/buildPhases';
import { timerTypeLabel } from '../../lib/timerMeta';
import type { Interval, IntervalConfig, PomodoroConfig, PresetType, SimpleConfig } from '../../lib/types';

const SWATCHES = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6'];
const POMO_DEFAULTS: PomodoroConfig = { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 };

export function TimerEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: timers = [] } = useTimers();
  const save = useSaveTimer();
  const del = useDeleteTimer();
  const existing = id ? timers.find((t) => t.id === id) : undefined;

  const [type, setType] = useState<PresetType>('interval');
  const [name, setName] = useState('');
  const [prep, setPrep] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [sets, setSets] = useState(5);
  const [cooldown, setCooldown] = useState(0);
  const [voice, setVoice] = useState(false);
  const [pomo, setPomo] = useState<PomodoroConfig>(POMO_DEFAULTS);
  const [intervals, setIntervals] = useState<Interval[]>([
    { label: 'Work', seconds: 40, kind: 'work', color: PHASE_COLORS.work },
    { label: 'Rest', seconds: 20, kind: 'rest', color: PHASE_COLORS.rest },
  ]);

  useEffect(() => {
    if (!existing) return;
    setType(existing.type);
    setName(existing.name);
    if (existing.type === 'simple') {
      const c = existing.config as SimpleConfig;
      setMinutes(Math.round(c.totalSeconds / 60));
      setPrep(c.prepSeconds ?? 0);
    } else if (existing.type === 'pomodoro') {
      setPomo(existing.config as PomodoroConfig);
    } else {
      const c = existing.config as IntervalConfig;
      setPrep(c.prepSeconds ?? 0);
      setSets(c.sets);
      setCooldown(c.cooldownSeconds ?? 0);
      setIntervals(c.intervals.length ? c.intervals : intervals);
      setVoice(c.sounds?.voice ?? false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  function updateInterval(i: number, patch: Partial<Interval>) {
    setIntervals((arr) => arr.map((iv, idx) => (idx === i ? { ...iv, ...patch } : iv)));
  }
  function addInterval() {
    setIntervals((arr) => [...arr, { label: 'Work', seconds: 30, kind: 'work', color: PHASE_COLORS.work }]);
  }
  function removeInterval(i: number) {
    setIntervals((arr) => arr.filter((_, idx) => idx !== i));
  }
  function updatePomo(patch: Partial<PomodoroConfig>) {
    setPomo((p) => ({ ...p, ...patch }));
  }

  async function onSave() {
    let config: SimpleConfig | IntervalConfig | PomodoroConfig;
    if (type === 'simple') {
      config = { totalSeconds: minutes * 60, prepSeconds: prep };
    } else if (type === 'pomodoro') {
      config = pomo;
    } else {
      config = { prepSeconds: prep, sets, cooldownSeconds: cooldown, intervals, sounds: { countdownBeeps: true, voice } };
    }
    const fallbackName =
      type === 'simple' ? 'Focus timer' : type === 'pomodoro' ? `${pomo.work}/${pomo.short} × ${pomo.rounds}` : 'Interval timer';
    await save.mutateAsync({ id, name: name.trim() || fallbackName, type, config });
    navigate('/timer');
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="pt-1 text-2xl font-bold">{existing ? 'Edit timer' : 'New timer'}</h1>

      <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="flex gap-2">
        {(['pomodoro', 'simple', 'interval'] as PresetType[]).map((tt) => (
          <button key={tt} className={`chip flex-1 ${type === tt ? 'chip-active' : ''}`} onClick={() => setType(tt)}>
            {timerTypeLabel(tt)}
          </button>
        ))}
      </div>

      <div className="card space-y-3 p-4">
        {type === 'pomodoro' ? (
          <>
            <Stepper label="Focus block" value={pomo.work} onChange={(v) => updatePomo({ work: v })} min={1} max={120} suffix="min" />
            <Stepper label="Short break" value={pomo.short} onChange={(v) => updatePomo({ short: v })} min={1} max={60} suffix="min" />
            <Stepper label="Long break" value={pomo.long} onChange={(v) => updatePomo({ long: v })} min={1} max={120} suffix="min" />
            <Stepper label="Long break every" value={pomo.longEvery} onChange={(v) => updatePomo({ longEvery: v })} min={1} max={12} suffix="blocks" />
            <Stepper label="Blocks this session" value={pomo.rounds} onChange={(v) => updatePomo({ rounds: v })} min={1} max={16} />
          </>
        ) : (
          <>
            <Stepper label="Prep countdown" value={prep} onChange={setPrep} min={0} max={60} suffix="s" />
            {type === 'simple' ? (
              <Stepper label="Duration" value={minutes} onChange={setMinutes} min={1} max={180} suffix="min" />
            ) : (
              <>
                <Stepper label="Sets" value={sets} onChange={setSets} min={1} max={50} />
                <Stepper label="Cooldown" value={cooldown} onChange={setCooldown} min={0} max={600} step={5} suffix="s" />
              </>
            )}
          </>
        )}
      </div>

      {type === 'interval' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="label">Intervals (per set)</h2>
            <button className="inline-flex items-center gap-1 text-sm text-accent" onClick={addInterval}><Plus size={14} /> Add</button>
          </div>
          {intervals.map((iv, i) => (
            <div key={i} className="card space-y-3 p-3">
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={iv.label}
                  onChange={(e) => updateInterval(i, { label: e.target.value })}
                  placeholder="Label"
                />
                <select
                  className="input w-28"
                  value={iv.kind}
                  onChange={(e) => updateInterval(i, { kind: e.target.value as 'work' | 'rest' })}
                >
                  <option value="work">Work</option>
                  <option value="rest">Rest</option>
                </select>
                {intervals.length > 1 && (
                  <button className="px-2 text-slate-500 hover:text-rose-400" onClick={() => removeInterval(i)}><X size={16} /></button>
                )}
              </div>
              <Stepper label="Seconds" value={iv.seconds} onChange={(v) => updateInterval(i, { seconds: v })} min={1} max={3600} step={5} suffix="s" />
              <div className="flex gap-2">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateInterval(i, { color: c })}
                    className={`h-6 w-6 rounded-full border-2 ${iv.color === c ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          ))}
          <label className="flex items-center justify-between text-sm text-slate-300">
            Spoken cues (voice)
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="h-5 w-5 accent-accent" />
          </label>
        </div>
      )}

      <div className="flex gap-3">
        <button className="btn-accent flex-1" onClick={onSave} disabled={save.isPending}>Save</button>
        {existing && (
          <button className="btn-outline text-rose-400" onClick={() => { del.mutate(existing.id); navigate('/timer'); }}>Delete</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add client/src/features/timers/TimerEditor.tsx
git commit -m "feat(timer): support Focus block type in the timer editor"
```

> Manual verification is deferred to Task 4 (after the page and routing exist), where all three types are built and launched end-to-end.

---

## Task 3: Rewrite `/timer` into the unified page

Replace the builder-with-chips `Timer.tsx` with a page that shows a compact quick-start row plus the saved-timers grid (absorbed from `TimersLibrary`), where tapping a card launches the timer.

**Files:**
- Modify (full rewrite): `client/src/features/timer/Timer.tsx`

**Interfaces:**
- Consumes: `timerTypeLabel` (Task 1); `useTimers`, `useSaveTimer`, `useDeleteTimer` (`lib/hooks.ts`); `runSpecFromPreset`, `describePreset`, `presetSeconds` (`lib/presets.ts`); `humanDuration` (`lib/time.ts`); `useRun` (`features/run/RunContext`); `Stepper`; `TimerPreset` (`lib/types.ts`).
- Produces: the `/timer` route component. Quick-start launches an ad-hoc `simple` run via `startRun({ type: 'simple', label: 'Timer', plannedSeconds, config: { totalSeconds, prepSeconds: 0 } })`. Cards launch via `startRun(runSpecFromPreset(t))`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `client/src/features/timer/Timer.tsx` with:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Play } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useDeleteTimer, useSaveTimer, useTimers } from '../../lib/hooks';
import { describePreset, presetSeconds, runSpecFromPreset } from '../../lib/presets';
import { timerTypeLabel } from '../../lib/timerMeta';
import { humanDuration } from '../../lib/time';
import { useRun } from '../run/RunContext';
import type { TimerPreset } from '../../lib/types';

/** Unified Timer page: a compact quick-start, then the saved-timers grid (tap to launch). */
export function Timer() {
  const { data: timers = [] } = useTimers();
  const del = useDeleteTimer();
  const save = useSaveTimer();
  const { startRun } = useRun();
  const active = timers.filter((t) => !t.archived);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Timer</h1>
        <p className="mt-1 text-sm text-slate-300">Run a saved timer, or start a quick one</p>
      </header>

      <QuickStart />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label">Saved timers</h2>
          <Link to="/timers/new" className="btn-accent px-3 py-2 text-sm"><Plus size={15} /> New</Link>
        </div>

        {active.length === 0 ? (
          <p className="py-8 text-center text-slate-500">
            No saved timers yet — create one with <span className="text-slate-300">+ New</span>.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((t) => (
              <TimerCard
                key={t.id}
                preset={t}
                onStart={() => startRun(runSpecFromPreset(t))}
                onDuplicate={() => save.mutate({ name: `${t.name} copy`, type: t.type, config: t.config })}
                onDelete={() => del.mutate(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickStart() {
  const { startRun } = useRun();
  const save = useSaveTimer();
  const [minutes, setMinutes] = useState(15);

  function start() {
    startRun({
      type: 'simple',
      label: 'Timer',
      plannedSeconds: minutes * 60,
      config: { totalSeconds: minutes * 60, prepSeconds: 0 },
    });
  }
  function savePreset() {
    save.mutate({ name: `${minutes} min`, type: 'simple', config: { totalSeconds: minutes * 60, prepSeconds: 0 } });
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <Stepper label="Quick start" value={minutes} onChange={setMinutes} min={1} max={180} suffix="min" />
      <div className="flex gap-2">
        <button className="btn-accent" onClick={start}><Play size={16} fill="currentColor" /> Start</button>
        <button className="btn-outline" onClick={savePreset} disabled={save.isPending}>Save</button>
      </div>
    </div>
  );
}

function TimerCard({
  preset,
  onStart,
  onDuplicate,
  onDelete,
}: {
  preset: TimerPreset;
  onStart: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart(); }
      }}
      className="card cursor-pointer p-4 transition hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{preset.name}</div>
          <div className="mt-0.5 text-sm text-slate-400">
            <span className="text-accent">{timerTypeLabel(preset.type)}</span> · {describePreset(preset)} · {humanDuration(presetSeconds(preset))}
          </div>
        </div>
        <span className="btn-accent shrink-0 px-3 py-2 text-sm"><Play size={15} fill="currentColor" /></span>
      </div>
      <div className="mt-3 flex gap-3 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
        <Link to={`/timers/${preset.id}`} className="hover:text-slate-300">Edit</Link>
        <button className="hover:text-slate-300" onClick={onDuplicate}>Duplicate</button>
        <button className="hover:text-rose-400" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix client run typecheck`
Expected: PASS (no errors). Note `Timer.tsx` no longer imports `Stepper`-unused symbols, `buildPhases`, or `PomodoroConfig`; the editor owns those now.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/timer/Timer.tsx
git commit -m "feat(timer): unify /timer into quick-start + tap-to-launch saved grid"
```

---

## Task 4: Route cleanup, remove orphaned library, verify end-to-end

Redirect the now-dead `/timers` to `/timer`, delete the absorbed `TimersLibrary`, and verify the whole flow.

**Files:**
- Modify: `client/src/App.tsx` (imports near `:14`; routes near `:53`)
- Delete: `client/src/features/timers/TimersLibrary.tsx`

**Interfaces:**
- Consumes: existing `Navigate` from `react-router-dom` (already imported in `App.tsx:2`).
- Produces: `/timers` → redirect to `/timer`; `/timers/new` and `/timers/:id` continue to render `TimerEditor`.

- [ ] **Step 1: Remove the `TimersLibrary` import**

In `client/src/App.tsx`, delete this line (around line 14):

```tsx
import { TimersLibrary } from './features/timers/TimersLibrary';
```

- [ ] **Step 2: Redirect `/timers` to `/timer`**

In `client/src/App.tsx`, replace this route line:

```tsx
        <Route path="/timers" element={<TimersLibrary />} />
```

with:

```tsx
        <Route path="/timers" element={<Navigate to="/timer" replace />} />
```

- [ ] **Step 3: Delete the orphaned library file**

```bash
git rm client/src/features/timers/TimersLibrary.tsx
```

- [ ] **Step 4: Typecheck and build**

Run: `npm --prefix client run typecheck && npm --prefix client run build`
Expected: PASS — no unresolved imports, no references to `TimersLibrary` remain.

- [ ] **Step 5: Run the full client test suite (no regressions)**

Run: `npm --prefix client test`
Expected: PASS, including the new `timerMeta` tests.

- [ ] **Step 6: Manual verification**

Start dev (`npm run dev`) and confirm in the browser:
- `/timer` shows the quick-start row and the saved-timers grid.
- Quick-start **Start** runs an ad-hoc timer; **Save** adds a `min`-named timer to the grid.
- Tapping a card body (and the ▶) launches that timer; clicking **Edit / Duplicate / Delete** does NOT launch it.
- `+ New` → editor creates each of the three types (Focus block / Timer / Interval); each appears in the grid and launches.
- Editing an existing card of each type (including Focus block) round-trips and saves back to the same card; **Delete** removes it. Editor returns to `/timer`.
- Navigating to `/timers` redirects to `/timer`.

- [ ] **Step 7: Commit**

```bash
git add client/src/App.tsx
git commit -m "refactor(timer): redirect /timers to /timer and remove orphaned library page"
```

---

## Self-Review Notes

- **Spec coverage:** unified page (Task 3) ✓; quick-start kept (Task 3 `QuickStart`) ✓; one editor for all three types (Task 2) ✓; one-tap card launch (Task 3 `TimerCard`) ✓; `/timers` redirect + library removed (Task 4) ✓; nav unchanged (untouched `Layout.tsx`) ✓; `runSpecFromPreset`/`describePreset`/`presetSeconds` reused unchanged ✓; edit now offered for pomodoro too (enabled by Task 2) ✓.
- **Edge handling:** action buttons stop propagation so they don't trigger card start (Task 3) ✓; empty-state message (Task 3) ✓; quick-start save naming `${minutes} min` matches prior behavior ✓; pomodoro round-trip in editor ✓.
- **Type consistency:** `timerTypeLabel(type: PresetType)` defined in Task 1 and consumed with the same signature in Tasks 2 & 3 ✓; editor `type` state widened to `PresetType` ✓; `RunSpec.timerId` is optional (`lib/types.ts:119`) so quick-start omitting it typechecks ✓.
