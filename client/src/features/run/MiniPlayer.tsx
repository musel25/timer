import { Play, Pause } from 'lucide-react';
import type { RunSpec } from '../../lib/types';
import type { EngineState } from '../../engine/useTimerEngine';
import { clock } from '../../lib/time';

interface MiniPlayerProps {
  spec: RunSpec;
  engine: EngineState;
  onExpand: () => void;
  onStop: () => void;
}

/**
 * Persistent, Spotify-style bar shown while a run is minimized. The engine keeps
 * running in ActiveRun; this is just a compact view + controls. Clicking the body
 * re-expands to the full RunScreen.
 */
export function MiniPlayer({ spec, engine, onExpand, onStop }: MiniPlayerProps) {
  const phase = engine.phase;
  const running = engine.status === 'running';
  const pct = Math.round((engine.fraction || 0) * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-4 sm:justify-end sm:px-4">
      <div className="card pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden p-2 pr-3 shadow-lg">
        {/* progress sliver along the top */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-ink-600">
          <div className="h-full transition-all" style={{ width: `${pct}%`, background: phase.color }} />
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); engine.toggle(); }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: phase.color }}
          title={running ? 'Pause' : 'Play'}
        >
          {running ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        <button onClick={onExpand} className="min-w-0 flex-1 text-left" title="Expand">
          <div className="truncate text-sm font-semibold text-slate-100">{spec.label}</div>
          <div className="truncate text-xs text-slate-400">
            <span className="font-mono tabular-nums">{clock(engine.remaining)}</span>
            <span> · {phase.label}</span>
          </div>
        </button>

        <button
          onClick={onStop}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 hover:bg-ink-700 hover:text-slate-100"
          title="Stop"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
