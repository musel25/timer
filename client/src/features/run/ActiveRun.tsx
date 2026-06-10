import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunSpec } from '../../lib/types';
import { useSettings } from '../../lib/hooks';
import { logSession } from '../../lib/offlineQueue';
import { buildPhases, totalSeconds, workSeconds } from '../../engine/buildPhases';
import { useTimerEngine } from '../../engine/useTimerEngine';
import { unlockAudio } from '../../engine/audio';
import { releaseWakeLock, reacquireWakeLock, requestWakeLock } from '../../engine/wakeLock';
import { RunScreen } from './RunScreen';
import { MiniPlayer } from './MiniPlayer';

/**
 * Owns the timer engine and session logging for a single run. Mounted by
 * RunProvider *above* the router, so the engine keeps ticking while the user
 * navigates. Renders the full-screen RunScreen when expanded, or the persistent
 * MiniPlayer when minimized — both are presentational views of this engine.
 */
export function ActiveRun({ spec, onClose, onAgain }: { spec: RunSpec; onClose: () => void; onAgain: (s: RunSpec) => void }) {
  const { data: settings } = useSettings();
  const phases = useMemo(() => spec.phases ?? buildPhases(spec), [spec]);
  const focusMode = spec.trackMode === 'focus';
  const planned = useMemo(() => spec.plannedSeconds || totalSeconds(phases), [phases, spec]);
  const plannedWork = useMemo(() => workSeconds(phases), [phases]);
  const startedAt = useRef(Date.now());
  const workDoneRef = useRef(0);
  const logged = useRef(false);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // In focus (Pomodoro) mode we log only completed work time, not breaks.
  function logRun(completed: boolean, totalElapsed: number) {
    if (logged.current) return;
    logged.current = true;
    void logSession({
      id: crypto.randomUUID(),
      habitId: focusMode ? null : (spec.habitId ?? null),
      timerId: spec.timerId ?? null,
      label: spec.label,
      type: spec.type,
      plannedSeconds: focusMode ? plannedWork : planned,
      actualSeconds: focusMode ? workDoneRef.current : totalElapsed,
      completed,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      note: null,
      createdAt: Date.now(),
    });
  }

  const engine = useTimerEngine(phases, {
    beeps: !muted && (settings?.beeps ?? true),
    voice: !muted && (settings?.voice ?? false),
    onPhaseComplete: (p) => {
      if (focusMode && p.kind === 'work') workDoneRef.current += p.seconds;
    },
    onFinish: (elapsed, completed) => logRun(completed, elapsed),
  });

  // Auto-start + keep the screen awake for the life of the run.
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

  const done = engine.status === 'done';

  // End + log the run. The only path that actually stops a timer.
  function stop() {
    if (engine.status !== 'done') logRun(false, engine.elapsed);
    onClose();
  }

  // Keyboard controls (global for the life of the run). ESC minimizes rather
  // than stopping, so the user can glance at the dashboard without losing the run.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); engine.toggle(); }
      else if (e.key === 'ArrowRight') engine.skipNext();
      else if (e.key === 'ArrowLeft') engine.skipPrev();
      else if (e.key === 'Escape' && !minimized && !done) setMinimized(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The Done screen always takes over full-screen so the summary is seen.
  if (minimized && !done) {
    return (
      <MiniPlayer
        spec={spec}
        engine={engine}
        onExpand={() => setMinimized(false)}
        onStop={stop}
      />
    );
  }

  return (
    <RunScreen
      spec={spec}
      engine={engine}
      muted={muted}
      onToggleMute={() => setMuted((m) => !m)}
      focusMode={focusMode}
      workDone={workDoneRef.current}
      onMinimize={() => setMinimized(true)}
      onStop={stop}
      onAgain={() => { onClose(); onAgain(spec); }}
      onClose={onClose}
    />
  );
}
