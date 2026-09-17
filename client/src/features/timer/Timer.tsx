import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Play } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useDeleteTimer, useSaveTimer, useTimers } from '../../lib/hooks';
import { describeBlock, runSpecFromPreset, type BlockShape } from '../../lib/presets';
import { timerTypeLabel } from '../../lib/timerMeta';
import { humanDuration } from '../../lib/time';
import { useRun } from '../run/RunContext';
import type { TimerPreset } from '../../lib/types';

/** Long enough to be a real go, short enough that starting it costs nothing. */
const DEFAULT_QUICK_MINUTES = 10;

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
          <div className="grid gap-4 sm:grid-cols-2">
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
  const [minutes, setMinutes] = useState(DEFAULT_QUICK_MINUTES);

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
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Stepper label="Quick start" value={minutes} onChange={setMinutes} min={1} max={180} suffix="min" editable />
        <div className="flex gap-2">
          <button className="btn-accent px-5 py-3 text-base" onClick={start}>
            <Play size={18} fill="currentColor" /> Start
          </button>
          <button className="btn-outline px-4 py-3" onClick={savePreset} disabled={save.isPending}>Save</button>
        </div>
      </div>
    </div>
  );
}

/** The block drawn to scale: one stripe per phase, so a 25/5 rhythm is visible
 *  before you read a word of it. */
function BlockBar({ shape }: { shape: BlockShape }) {
  const total = shape.segments.reduce((a, s) => a + s.seconds, 0) || 1;
  return (
    <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-ink-700">
      {shape.segments.map((s, i) => (
        <div
          key={i}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(s.seconds / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
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
  const shape = describeBlock(preset);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart(); }
      }}
      className="card flex cursor-pointer flex-col gap-4 p-5 transition hover:border-accent/50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="truncate font-semibold">{preset.name}</div>
        <span className="shrink-0 text-xs text-slate-500">{timerTypeLabel(preset.type)}</span>
      </div>

      {/* How many goes, and how long one go is — what you actually decide by.
          The total is arithmetic on those two, so it sits underneath. */}
      <div>
        <div className="flex items-baseline gap-2">
          {shape.sets > 1 && <span className="text-2xl font-semibold tabular-nums text-slate-400">{shape.sets} ×</span>}
          <span className="text-4xl font-bold tabular-nums tracking-tight">{shape.setLabel}</span>
        </div>
        {/* Only worth a line when the sets add up to something other than
            themselves — a single-set timer already shows its whole length. */}
        {shape.sets > 1 && (
          <div className="mt-1 text-sm text-slate-400">{humanDuration(shape.totalSeconds)} in all</div>
        )}
      </div>

      <BlockBar shape={shape} />

      <div className="flex-1 space-y-0.5 text-sm text-slate-500">
        {shape.detail.map((line) => <div key={line}>{line}</div>)}
      </div>

      <button className="btn-accent w-full py-3 text-base" onClick={(e) => { e.stopPropagation(); onStart(); }}>
        <Play size={18} fill="currentColor" /> Start
      </button>

      <div className="flex gap-3 text-xs text-slate-500" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Link to={`/timers/${preset.id}`} className="hover:text-slate-300">Edit</Link>
        <button className="hover:text-slate-300" onClick={onDuplicate}>Duplicate</button>
        <button className="hover:text-rose-400" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
