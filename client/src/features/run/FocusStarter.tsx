import { useState } from 'react';
import { Hourglass } from 'lucide-react';
import { useRun } from './RunContext';

const PRESETS = [25, 50, 60, 90];

/**
 * Entry point for the background focus session. When one is already running the
 * FocusBar owns it (start/stop/pause), so this just reflects that state.
 */
export function FocusStarter() {
  const { startFocus, focusActive } = useRun();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('45');

  if (focusActive) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-sm font-medium text-teal-300">
        <Hourglass size={15} /> Focus running
      </span>
    );
  }

  const start = (min: number) => {
    if (!Number.isFinite(min) || min <= 0) return;
    startFocus(min);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-ink-600/60 bg-ink-900/30 px-3 py-2 text-sm text-slate-300 backdrop-blur hover:text-slate-100"
        title="Start a focus session"
      >
        <Hourglass size={15} /> Focus
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-ink-600/60 bg-ink-900/95 p-2 shadow-xl backdrop-blur">
          <div className="mb-1.5 px-1 text-xs text-slate-400">Run habits inside a focus block</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => start(m)}
                className="chip flex-1 justify-center py-1.5 text-sm font-medium"
              >
                {m}m
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && start(Number(custom))}
              aria-label="Custom minutes"
              className="input w-20 py-1.5 text-sm"
            />
            <button onClick={() => start(Number(custom))} className="btn-accent flex-1 justify-center py-1.5 text-sm">
              Start {custom || '0'} min
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
