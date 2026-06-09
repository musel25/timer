import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunSpec } from '../../lib/types';
import { clock } from '../../lib/time';
import { useSettings } from '../../lib/hooks';
import { logSession } from '../../lib/offlineQueue';
import { buildPhases, totalSeconds } from '../../engine/buildPhases';
import { useTimerEngine } from '../../engine/useTimerEngine';
import { unlockAudio } from '../../engine/audio';
import { releaseWakeLock, reacquireWakeLock, requestWakeLock } from '../../engine/wakeLock';

const RING = 130;
const C = 2 * Math.PI * RING;

export function RunScreen({ spec, onClose, onAgain }: { spec: RunSpec; onClose: () => void; onAgain: (s: RunSpec) => void }) {
  const { data: settings } = useSettings();
  const phases = useMemo(() => buildPhases(spec), [spec]);
  const planned = useMemo(() => spec.plannedSeconds || totalSeconds(phases), [phases, spec]);
  const startedAt = useRef(Date.now());
  const logged = useRef(false);
  const [muted, setMuted] = useState(false);

  const engine = useTimerEngine(phases, {
    beeps: !muted && (settings?.beeps ?? true),
    voice: !muted && (settings?.voice ?? false),
    onFinish: (elapsed, completed) => {
      if (logged.current) return;
      logged.current = true;
      void logSession({
        id: crypto.randomUUID(),
        habitId: spec.habitId ?? null,
        timerId: spec.timerId ?? null,
        label: spec.label,
        type: spec.type,
        plannedSeconds: planned,
        actualSeconds: elapsed,
        completed,
        startedAt: startedAt.current,
        endedAt: Date.now(),
        note: null,
        createdAt: Date.now(),
      });
    },
  });

  // Auto-start + keep the screen awake.
  useEffect(() => {
    unlockAudio();
    engine.start();
    if (settings?.keepAwake ?? true) void requestWakeLock();
    const onVis = () => void reacquireWakeLock();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); engine.toggle(); }
      else if (e.key === 'ArrowRight') engine.skipNext();
      else if (e.key === 'ArrowLeft') engine.skipPrev();
      else if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function exit() {
    if (engine.status !== 'done' && !logged.current) {
      logged.current = true;
      void logSession({
        id: crypto.randomUUID(),
        habitId: spec.habitId ?? null,
        timerId: spec.timerId ?? null,
        label: spec.label,
        type: spec.type,
        plannedSeconds: planned,
        actualSeconds: engine.elapsed,
        completed: false,
        startedAt: startedAt.current,
        endedAt: Date.now(),
        note: null,
        createdAt: Date.now(),
      });
    }
    onClose();
  }

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
        <button onClick={exit} className="rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">✕</button>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="text-7xl">✓</div>
          <div>
            <div className="text-2xl font-bold">Done</div>
            <div className="mt-1 text-white/70">{clock(engine.elapsed)} of focused time logged</div>
          </div>
          <div className="flex gap-3">
            <button className="btn-outline border-white/30 text-white" onClick={() => { onClose(); onAgain(spec); }}>↻ Again</button>
            <button className="btn-accent" onClick={onClose}>Done</button>
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
            <CtrlButton onClick={engine.skipPrev} label="⏮" />
            <CtrlButton onClick={() => engine.addTime(15)} label="+15s" small />
            <button
              onClick={engine.toggle}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl text-ink-900 shadow-lg active:scale-95"
            >
              {engine.status === 'running' ? '⏸' : '▶'}
            </button>
            <CtrlButton onClick={() => engine.skipNext()} label="⏭" />
            <CtrlButton onClick={() => setMuted((m) => !m)} label={muted ? '🔇' : '🔊'} small />
          </div>
        </>
      )}
    </div>
  );
}

function CtrlButton({ onClick, label, small }: { onClick: () => void; label: string; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 ${
        small ? 'h-12 px-3 text-sm' : 'h-12 w-12 text-lg'
      }`}
    >
      {label}
    </button>
  );
}
