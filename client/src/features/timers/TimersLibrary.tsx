import { Link } from 'react-router-dom';
import { useDeleteTimer, useSaveTimer, useTimers } from '../../lib/hooks';
import { describePreset, presetSeconds, runSpecFromPreset } from '../../lib/presets';
import { humanDuration } from '../../lib/time';
import { useRun } from '../run/RunContext';

export function TimersLibrary() {
  const { data: timers = [] } = useTimers();
  const del = useDeleteTimer();
  const save = useSaveTimer();
  const { startRun } = useRun();
  const active = timers.filter((t) => !t.archived);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-bold">Timers</h1>
        <Link to="/timers/new" className="btn-accent px-3 py-2 text-sm">＋ New</Link>
      </div>

      {active.length === 0 && <p className="py-8 text-center text-slate-500">No saved timers yet.</p>}

      <div className="space-y-3">
        {active.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{t.name}</div>
                <div className="text-sm text-slate-400">
                  {describePreset(t)} · {humanDuration(presetSeconds(t))} · <span className="capitalize">{t.type}</span>
                </div>
              </div>
              <button className="btn-accent px-3 py-2 text-sm" onClick={() => startRun(runSpecFromPreset(t))}>▶</button>
            </div>
            <div className="mt-3 flex gap-3 text-xs text-slate-500">
              <Link to={`/timers/${t.id}`} className="hover:text-slate-300">Edit</Link>
              <button className="hover:text-slate-300" onClick={() => save.mutate({ name: `${t.name} copy`, type: t.type, config: t.config })}>
                Duplicate
              </button>
              <button className="hover:text-rose-400" onClick={() => del.mutate(t.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
