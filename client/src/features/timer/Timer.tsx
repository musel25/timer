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
