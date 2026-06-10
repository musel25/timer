import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useDeleteTimer, useSaveTimer, useTimers } from '../../lib/hooks';
import { PHASE_COLORS } from '../../engine/buildPhases';
import type { Interval, IntervalConfig, SimpleConfig, TimerType } from '../../lib/types';

const SWATCHES = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6'];

export function TimerEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: timers = [] } = useTimers();
  const save = useSaveTimer();
  const del = useDeleteTimer();
  const existing = id ? timers.find((t) => t.id === id) : undefined;

  const [type, setType] = useState<TimerType>('interval');
  const [name, setName] = useState('');
  const [prep, setPrep] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [sets, setSets] = useState(5);
  const [cooldown, setCooldown] = useState(0);
  const [voice, setVoice] = useState(false);
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

  async function onSave() {
    const config =
      type === 'simple'
        ? ({ totalSeconds: minutes * 60, prepSeconds: prep } as SimpleConfig)
        : ({ prepSeconds: prep, sets, cooldownSeconds: cooldown, intervals, sounds: { countdownBeeps: true, voice } } as IntervalConfig);
    await save.mutateAsync({ id, name: name.trim() || (type === 'simple' ? 'Focus timer' : 'Interval timer'), type, config });
    navigate('/timers');
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="pt-1 text-2xl font-bold">{existing ? 'Edit timer' : 'New timer'}</h1>

      <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="flex gap-2">
        <button className={`chip flex-1 ${type === 'simple' ? 'chip-active' : ''}`} onClick={() => setType('simple')}>Focus block</button>
        <button className={`chip flex-1 ${type === 'interval' ? 'chip-active' : ''}`} onClick={() => setType('interval')}>Interval</button>
      </div>

      <div className="card space-y-3 p-4">
        <Stepper label="Prep countdown" value={prep} onChange={setPrep} min={0} max={60} suffix="s" />
        {type === 'simple' ? (
          <Stepper label="Duration" value={minutes} onChange={setMinutes} min={1} max={180} suffix="min" />
        ) : (
          <>
            <Stepper label="Sets" value={sets} onChange={setSets} min={1} max={50} />
            <Stepper label="Cooldown" value={cooldown} onChange={setCooldown} min={0} max={600} step={5} suffix="s" />
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
          <button className="btn-outline text-rose-400" onClick={() => { del.mutate(existing.id); navigate('/timers'); }}>Delete</button>
        )}
      </div>
    </div>
  );
}
