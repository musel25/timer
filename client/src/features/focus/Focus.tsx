import { Fragment, useEffect, useRef, useState } from 'react';
import { Stepper } from '../../components/Stepper';
import { useSaveSettings, useSettings } from '../../lib/hooks';
import type { PomodoroConfig } from '../../lib/types';
import { buildPomodoroPhases, totalSeconds, workSeconds } from '../../engine/buildPhases';
import { humanDuration } from '../../lib/time';
import { useRun } from '../run/RunContext';

const DEFAULTS: PomodoroConfig = { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 };

export function Focus() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const { startRun } = useRun();

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
      // config is unused when `phases` is provided, but RunSpec requires it.
      config: { prepSeconds: prep, sets: rounds, intervals: [], cooldownSeconds: 0 },
      label: task.trim() || 'Pomodoro',
      plannedSeconds: workSeconds(phases),
      phases,
      trackMode: 'focus',
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="pt-1">
        <h1 className="text-2xl font-bold">🍅 Focus</h1>
        <p className="text-sm text-slate-400">Pomodoro sessions for deep work &amp; study</p>
      </header>

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
        <button className="btn-accent col-span-2" onClick={start}>▶ Start focus</button>
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
