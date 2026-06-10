import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stepper } from '../../components/Stepper';
import { useSaveSettings, useSaveTimer, useSettings } from '../../lib/hooks';
import type { IntervalConfig, PomodoroConfig, RunSpec, SimpleConfig } from '../../lib/types';
import { buildPomodoroPhases, PHASE_COLORS, totalSeconds, workSeconds } from '../../engine/buildPhases';
import { humanDuration } from '../../lib/time';
import { useRun } from '../run/RunContext';

const DEFAULTS: PomodoroConfig = { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 };

type Mode = 'pomodoro' | 'focus' | 'interval';

const MODES: { id: Mode; label: string }[] = [
  { id: 'pomodoro', label: 'Pomodoro' },
  { id: 'focus', label: 'Focus block' },
  { id: 'interval', label: 'Interval' },
];

/** Unified timer builder: Pomodoro (deep-work cycles), Focus block (simple), and Interval. */
export function Timer() {
  const { startRun } = useRun();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const saveTimer = useSaveTimer();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('pomodoro');

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="pt-1">
        <h1 className="text-2xl font-bold">Timer</h1>
        <p className="text-sm text-slate-400">Pomodoro sessions, focus blocks &amp; interval workouts</p>
      </header>

      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`chip flex-1 ${mode === m.id ? 'chip-active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'pomodoro' ? (
        <PomodoroBuilder settings={settings} startRun={startRun} saveSettings={saveSettings} />
      ) : (
        <SimpleBuilder
          mode={mode}
          settings={settings}
          startRun={startRun}
          saveTimer={saveTimer}
          onSaved={() => navigate('/timers')}
        />
      )}
    </div>
  );
}

function PomodoroBuilder({
  settings,
  startRun,
  saveSettings,
}: {
  settings: ReturnType<typeof useSettings>['data'];
  startRun: (s: RunSpec) => void;
  saveSettings: ReturnType<typeof useSaveSettings>;
}) {
  const [task, setTask] = useState('');
  const [work, setWork] = useState(DEFAULTS.work);
  const [short, setShort] = useState(DEFAULTS.short);
  const [long, setLong] = useState(DEFAULTS.long);
  const [longEvery, setLongEvery] = useState(DEFAULTS.longEvery);
  const [rounds, setRounds] = useState(DEFAULTS.rounds);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !settings?.pomodoro) return;
    const p = settings.pomodoro;
    setWork(p.work); setShort(p.short); setLong(p.long); setLongEvery(p.longEvery); setRounds(p.rounds);
    seeded.current = true;
  }, [settings?.pomodoro]);

  const cfg: PomodoroConfig = { work, short, long, longEvery, rounds };
  const totalFocus = work * rounds;
  const totalSpan = Math.round(totalSeconds(buildPomodoroPhases(cfg, '', 0)) / 60);

  function start() {
    const prep = settings?.prepSeconds ?? 5;
    const phases = buildPomodoroPhases(cfg, task.trim(), prep);
    startRun({
      type: 'interval',
      config: { prepSeconds: prep, sets: rounds, intervals: [], cooldownSeconds: 0 },
      label: task.trim() || 'Pomodoro',
      plannedSeconds: workSeconds(phases),
      phases,
      trackMode: 'focus',
    });
  }

  return (
    <div className="space-y-6">
      <input
        className="input"
        placeholder="What are you working on? (optional)"
        value={task}
        onChange={(e) => setTask(e.target.value)}
      />

      <div className="card space-y-3 p-4">
        <Stepper label="Focus block" value={work} onChange={setWork} min={1} max={120} suffix="min" />
        <Stepper label="Short break" value={short} onChange={setShort} min={1} max={60} suffix="min" />
        <Stepper label="Long break" value={long} onChange={setLong} min={1} max={120} suffix="min" />
        <Stepper label="Long break every" value={longEvery} onChange={setLongEvery} min={1} max={12} suffix="pomos" />
        <Stepper label="Pomodoros this session" value={rounds} onChange={setRounds} min={1} max={16} />
      </div>

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: rounds }).map((_, i) => (
            <Fragment key={i}>
              <span className="h-3.5 w-3.5 rounded-full bg-accent" title={`Focus ${i + 1}`} />
              {i < rounds - 1 && (
                <span
                  className={`h-1.5 w-5 rounded ${(i + 1) % longEvery === 0 ? 'bg-violet-500' : 'bg-blue-500'}`}
                  title={(i + 1) % longEvery === 0 ? 'Long break' : 'Short break'}
                />
              )}
            </Fragment>
          ))}
        </div>
        <div className="text-sm text-slate-400">
          {rounds} × {work}m focus = <span className="text-slate-200">{humanDuration(totalFocus * 60)} focus</span>
          {' · '}~{humanDuration(totalSpan * 60)} total
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className="btn-accent col-span-2" onClick={start}>Start focus</button>
        <button
          className="btn-outline"
          onClick={() => saveSettings.mutate({ pomodoro: cfg })}
          disabled={saveSettings.isPending}
        >
          Save default
        </button>
      </div>
    </div>
  );
}

function SimpleBuilder({
  mode,
  settings,
  startRun,
  saveTimer,
  onSaved,
}: {
  mode: Mode;
  settings: ReturnType<typeof useSettings>['data'];
  startRun: (s: RunSpec) => void;
  saveTimer: ReturnType<typeof useSaveTimer>;
  onSaved: () => void;
}) {
  const isInterval = mode === 'interval';
  const [minutes, setMinutes] = useState(10);
  const [work, setWork] = useState(40);
  const [rest, setRest] = useState(20);
  const [sets, setSets] = useState(5);
  const [prep, setPrep] = useState(settings?.prepSeconds ?? 10);

  function spec(): RunSpec {
    if (isInterval) {
      const config: IntervalConfig = {
        prepSeconds: prep,
        sets,
        cooldownSeconds: 0,
        intervals: [
          { label: 'Work', seconds: work, kind: 'work', color: PHASE_COLORS.work },
          { label: 'Rest', seconds: rest, kind: 'rest', color: PHASE_COLORS.rest },
        ],
        sounds: { countdownBeeps: true, voice: settings?.voice ?? false },
      };
      return { type: 'interval', label: 'Quick interval', config, plannedSeconds: prep + sets * (work + rest) };
    }
    const config: SimpleConfig = { totalSeconds: minutes * 60, prepSeconds: prep };
    return { type: 'simple', label: 'Focus block', config, plannedSeconds: minutes * 60 };
  }

  async function saveAsPreset() {
    const s = spec();
    await saveTimer.mutateAsync({
      name: isInterval ? `Interval ${sets}×${work}/${rest}` : `${minutes} min focus`,
      type: s.type,
      config: s.config,
    });
    onSaved();
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-4">
        {!isInterval ? (
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} min={1} max={180} suffix="min" />
        ) : (
          <div className="space-y-3">
            <Stepper label="Work" value={work} onChange={setWork} min={5} max={600} step={5} suffix="s" />
            <Stepper label="Rest" value={rest} onChange={setRest} min={0} max={600} step={5} suffix="s" />
            <Stepper label="Sets" value={sets} onChange={setSets} min={1} max={50} />
          </div>
        )}
        <Stepper label="Prep countdown" value={prep} onChange={setPrep} min={0} max={60} step={1} suffix="s" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className="btn-accent col-span-2" onClick={() => startRun(spec())}>Start</button>
        <button className="btn-outline" onClick={saveAsPreset} disabled={saveTimer.isPending}>Save</button>
      </div>
    </div>
  );
}
