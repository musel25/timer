import { Fragment, useEffect, useRef, useState } from 'react';
import { Pencil, Play, X } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useDeleteTimer, useSaveTimer, useSettings, useTimers } from '../../lib/hooks';
import type { PomodoroConfig, SimpleConfig, TimerPreset } from '../../lib/types';
import { buildPomodoroPhases, totalSeconds, workSeconds } from '../../engine/buildPhases';
import { humanDuration } from '../../lib/time';
import { useRun } from '../run/RunContext';

const POMODORO_DEFAULTS: PomodoroConfig = { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 };

type Mode = 'focus' | 'timer';

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
  onDelete,
}: {
  presets: TimerPreset[];
  selectedId: string | null;
  onPick: (p: TimerPreset) => void;
  onDelete: (p: TimerPreset) => void;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <div key={p.id} className={`chip gap-1 pr-1.5 ${selectedId === p.id ? 'chip-active' : ''}`}>
          <button onClick={() => onPick(p)}>{p.name}</button>
          <button
            aria-label={`Delete preset ${p.name}`}
            title="Delete preset"
            className={`rounded p-0.5 transition ${selectedId === p.id ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-rose-400'}`}
            onClick={() => onDelete(p)}
          >
            <X size={13} />
          </button>
        </div>
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
  const deleteTimer = useDeleteTimer();
  const presets = timers.filter((t) => !t.archived && t.type === 'pomodoro');

  const [task, setTask] = useState('');
  const [cfg, setCfg] = useState<PomodoroConfig>(POMODORO_DEFAULTS);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !settings?.pomodoro) return;
    setCfg(settings.pomodoro);
    seeded.current = true;
  }, [settings?.pomodoro]);

  function loadPreset(p: TimerPreset) {
    if (presetId === p.id) { setPresetId(null); return; } // tap again to deselect
    setCfg(p.config as PomodoroConfig);
    setPresetId(p.id);
  }
  // Editing keeps the preset selected so "Update preset" writes the changes back.
  function update(patch: Partial<PomodoroConfig>) {
    setCfg((c) => ({ ...c, ...patch }));
  }
  function deletePreset(p: TimerPreset) {
    deleteTimer.mutate(p.id);
    if (presetId === p.id) setPresetId(null);
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
    });
  }

  function savePreset() {
    saveTimer.mutate({ id: presetId ?? undefined, name: `${cfg.work}/${cfg.short} × ${cfg.rounds}`, type: 'pomodoro', config: cfg });
  }

  return (
    <div className="space-y-5">
      <input
        className="input"
        placeholder="What are you working on? (optional)"
        value={task}
        onChange={(e) => setTask(e.target.value)}
      />

      <PresetChips presets={presets} selectedId={presetId} onPick={loadPreset} onDelete={deletePreset} />

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
          {presetId ? 'Update preset' : 'Save preset'}
        </button>
      </div>
    </div>
  );
}

function SimpleTimerBuilder() {
  const { startRun } = useRun();
  const { data: timers = [] } = useTimers();
  const saveTimer = useSaveTimer();
  const deleteTimer = useDeleteTimer();
  const presets = timers.filter((t) => !t.archived && t.type === 'simple');

  const [minutes, setMinutes] = useState(10);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function loadPreset(p: TimerPreset) {
    if (presetId === p.id) { setPresetId(null); return; } // tap again to deselect
    setMinutes(Math.round((p.config as SimpleConfig).totalSeconds / 60));
    setPresetId(p.id);
  }
  // Editing keeps the preset selected so "Update preset" writes the changes back.
  function update(v: number) {
    setMinutes(v);
  }
  function deletePreset(p: TimerPreset) {
    deleteTimer.mutate(p.id);
    if (presetId === p.id) setPresetId(null);
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
    saveTimer.mutate({ id: presetId ?? undefined, name: `${minutes} min`, type: 'simple', config });
  }

  return (
    <div className="space-y-5">
      <PresetChips presets={presets} selectedId={presetId} onPick={loadPreset} onDelete={deletePreset} />

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
          {presetId ? 'Update preset' : 'Save preset'}
        </button>
      </div>
    </div>
  );
}
