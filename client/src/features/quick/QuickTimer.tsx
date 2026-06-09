import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stepper } from '../../components/Stepper';
import { useSaveTimer, useSettings } from '../../lib/hooks';
import { PHASE_COLORS } from '../../engine/buildPhases';
import { useRun } from '../run/RunContext';
import type { IntervalConfig, RunSpec, SimpleConfig } from '../../lib/types';

export function QuickTimer() {
  const { startRun } = useRun();
  const { data: settings } = useSettings();
  const saveTimer = useSaveTimer();
  const navigate = useNavigate();

  const [isInterval, setIsInterval] = useState(false);
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
    return { type: 'simple', label: 'Quick timer', config, plannedSeconds: minutes * 60 };
  }

  async function saveAsPreset() {
    const s = spec();
    await saveTimer.mutateAsync({
      name: isInterval ? `Interval ${sets}×${work}/${rest}` : `${minutes} min focus`,
      type: s.type,
      config: s.config,
    });
    navigate('/timers');
  }

  return (
    <div className="space-y-6">
      <h1 className="pt-1 text-2xl font-bold">Quick Timer</h1>

      <div className="card space-y-4 p-4">
        <div className="flex gap-2">
          <button className={`chip flex-1 ${!isInterval ? 'chip-active' : ''}`} onClick={() => setIsInterval(false)}>
            Focus block
          </button>
          <button className={`chip flex-1 ${isInterval ? 'chip-active' : ''}`} onClick={() => setIsInterval(true)}>
            Interval
          </button>
        </div>

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
        <button className="btn-accent col-span-2" onClick={() => startRun(spec())}>▶ Start</button>
        <button className="btn-outline" onClick={saveAsPreset} disabled={saveTimer.isPending}>⤓ Save</button>
      </div>
    </div>
  );
}
