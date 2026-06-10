import type { ReactNode } from 'react';
import { ChevronDown, X, Check, RotateCcw, SkipBack, SkipForward, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import type { RunSpec } from '../../lib/types';
import type { EngineState } from '../../engine/useTimerEngine';
import { clock } from '../../lib/time';

const RING = 130;
const C = 2 * Math.PI * RING;

interface RunScreenProps {
  spec: RunSpec;
  engine: EngineState;
  muted: boolean;
  onToggleMute: () => void;
  focusMode: boolean;
  workDone: number;
  onMinimize: () => void;
  onStop: () => void;
  onAgain: () => void;
  onClose: () => void;
}

export function RunScreen({ spec, engine, muted, onToggleMute, focusMode, workDone, onMinimize, onStop, onAgain, onClose }: RunScreenProps) {
  const phase = engine.phase;
  const done = engine.status === 'done';
  const bg = done ? '#14b8a6' : phase.color;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col text-white"
      style={{ background: `radial-gradient(120% 90% at 50% 25%, ${bg}33, #0b0f14 72%)` }}
    >
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="truncate text-lg font-semibold">{spec.label}</div>
        <div className="flex items-center gap-2">
          {!done && (
            <button onClick={onMinimize} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" title="Minimize (Esc)"><ChevronDown size={18} /></button>
          )}
          <button onClick={onStop} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" title="Stop"><X size={18} /></button>
        </div>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15"><Check size={56} strokeWidth={2.5} /></div>
          <div>
            <div className="text-2xl font-bold">Done</div>
            <div className="mt-1 text-white/70">{clock(focusMode ? workDone : engine.elapsed)} of focused time logged</div>
          </div>
          <div className="flex gap-3">
            {spec.habitId ? (
              <>
                <button className="btn-accent" onClick={onAgain}><RotateCcw size={16} /> +10 more</button>
                <button className="btn-outline border-white/30 text-white" onClick={onClose}>Done</button>
              </>
            ) : (
              <>
                <button className="btn-outline border-white/30 text-white" onClick={onAgain}><RotateCcw size={16} /> Again</button>
                <button className="btn-accent" onClick={onClose}>Done</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="relative" style={{ width: 2 * (RING + 16), height: 2 * (RING + 16) }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${2 * (RING + 16)} ${2 * (RING + 16)}`} className="-rotate-90">
                <circle cx={RING + 16} cy={RING + 16} r={RING} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
                <circle
                  cx={RING + 16} cy={RING + 16} r={RING} fill="none" stroke={phase.color} strokeWidth="10"
                  strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * engine.fraction}
                  style={{ transition: engine.status === 'running' ? 'stroke-dashoffset 0.95s linear' : 'none' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-mono text-6xl font-bold tabular-nums sm:text-7xl">{clock(engine.remaining)}</div>
                <div className="mt-1 text-sm font-semibold uppercase tracking-widest text-white/80">{phase.label}</div>
                {phase.setCount && phase.setCount > 1 && (
                  <div className="mt-1 text-white/60">Set {phase.setIndex} / {phase.setCount}</div>
                )}
              </div>
            </div>

            <div className="text-sm text-white/60">
              {clock(engine.totalRemaining)} left
              {engine.nextPhase && <span> · next: {engine.nextPhase.label}</span>}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <CtrlButton onClick={engine.skipPrev}><SkipBack size={20} /></CtrlButton>
            <CtrlButton onClick={() => engine.addTime(15)} small>+15s</CtrlButton>
            <button
              onClick={engine.toggle}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#0b0f14] shadow-lg active:scale-95"
            >
              {engine.status === 'running' ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
            </button>
            <CtrlButton onClick={() => engine.skipNext()}><SkipForward size={20} /></CtrlButton>
            <CtrlButton onClick={onToggleMute} small>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</CtrlButton>
          </div>
        </>
      )}
    </div>
  );
}

function CtrlButton({ onClick, children, small }: { onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 ${
        small ? 'h-12 px-3 text-sm' : 'h-12 w-12'
      }`}
    >
      {children}
    </button>
  );
}
