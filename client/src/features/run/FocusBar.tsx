import { Hourglass, Pause, Play, X } from 'lucide-react';
import type { EngineState } from '../../engine/useTimerEngine';
import { clock } from '../../lib/time';

const FOCUS_COLOR = '#14b8a6';

/**
 * Slim floating pill for the background focus session — the "umbrella" that keeps
 * running while short habit timers run in the foreground. Sits above everything
 * (incl. the full-screen RunScreen) so the focus countdown is always visible.
 */
export function FocusBar({ label, engine, onStop }: { label: string; engine: EngineState; onStop: () => void }) {
  const running = engine.status === 'running';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[55] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="card pointer-events-auto flex items-center gap-2.5 py-1.5 pl-3 pr-2 shadow-lg">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: FOCUS_COLOR }}>
          <Hourglass size={14} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-100">{label}</div>
          <div className="font-mono text-sm tabular-nums text-slate-300">{clock(engine.totalRemaining)}</div>
        </div>
        <button
          onClick={() => engine.toggle()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-ink-700 hover:text-slate-100"
          title={running ? 'Pause focus' : 'Resume focus'}
        >
          {running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <button
          onClick={onStop}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-ink-700 hover:text-slate-100"
          title="End focus session"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
