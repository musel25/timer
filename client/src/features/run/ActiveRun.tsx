import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunSpec } from '../../lib/types';
import { useSettings } from '../../lib/hooks';
import { isTypingTarget } from '../../lib/dom';
import { logSession } from '../../lib/offlineQueue';
import { buildPhases, totalSeconds, workSeconds } from '../../engine/buildPhases';
import { seekToElapsed, completedWorkSeconds } from '../../engine/seek';
import { useTimerEngine } from '../../engine/useTimerEngine';
import { unlockAudio } from '../../engine/audio';
import { releaseWakeLock, reacquireWakeLock, requestWakeLock } from '../../engine/wakeLock';
import { saveRun } from './activeRunStore';
import { attributedHabitId } from './attribution';
import { RunScreen } from './RunScreen';
import { MiniPlayer } from './MiniPlayer';

/**
 * Owns the timer engine and session logging for a single run. Mounted by
 * RunProvider *above* the router, so the engine keeps ticking while the user
 * navigates. Renders the full-screen RunScreen when expanded, or the persistent
 * MiniPlayer when minimized — both are presentational views of this engine.
 */
export function ActiveRun({
  spec,
  onClose,
  onAgain,
  startedAtEpoch,
  resumeElapsed = 0,
  taggedHabitId = null,
}: {
  spec: RunSpec;
  onClose: () => void;
  onAgain: (s: RunSpec) => void;
  /** Original wall-clock start (for a resumed run); defaults to now. */
  startedAtEpoch?: number;
  /** Seconds already elapsed when resuming a persisted run. */
  resumeElapsed?: number;
  /** Habit this run is currently attributed to, if any (live re-taggable from the dashboard). */
  taggedHabitId?: string | null;
}) {
  const { data: settings } = useSettings();
  // Keep the latest tag in a ref so the finish-time log reads the current value,
  // not the one captured when the engine's onFinish closure was created.
  const tagRef = useRef(taggedHabitId);
  tagRef.current = taggedHabitId;
  const phases = useMemo(() => spec.phases ?? buildPhases(spec), [spec]);
  const focusMode = spec.trackMode === 'focus';
  const planned = useMemo(() => spec.plannedSeconds || totalSeconds(phases), [phases, spec]);
  const plannedWork = useMemo(() => workSeconds(phases), [phases]);
  const startedAt = useRef(startedAtEpoch ?? Date.now());
  // On resume, seed work-done with the work phases already completed (the engine
  // re-adds the current partial work phase in full when it finishes).
  const workDoneRef = useRef(
    resumeElapsed > 0 && focusMode ? completedWorkSeconds(phases, seekToElapsed(phases, resumeElapsed).index) : 0,
  );
  const logged = useRef(false);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // In focus (Pomodoro) mode we log only completed work time, not breaks.
  function logRun(completed: boolean, totalElapsed: number) {
    if (logged.current) return;
    logged.current = true;
    void logSession({
      id: crypto.randomUUID(),
      habitId: attributedHabitId(tagRef.current, spec.habitId),
      timerId: spec.timerId ?? null,
      label: spec.label,
      type: spec.type,
      plannedSeconds: focusMode ? plannedWork : planned,
      actualSeconds: focusMode ? workDoneRef.current : totalElapsed,
      completed,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      note: null,
      category: 'habit',
      parentSessionId: null,
      createdAt: Date.now(),
    });
    saveRun('foreground', null);
  }

  const engine = useTimerEngine(phases, {
    beeps: !muted && (settings?.beeps ?? true),
    voice: !muted && (settings?.voice ?? false),
    resumeElapsedSeconds: resumeElapsed,
    onPhaseComplete: (p) => {
      if (focusMode && p.kind === 'work') workDoneRef.current += p.seconds;
    },
    onFinish: (elapsed, completed) => logRun(completed, elapsed),
  });

  // Persist a snapshot each displayed second so a foreground run resumes after reload.
  useEffect(() => {
    if (engine.status === 'running' || engine.status === 'paused') {
      saveRun('foreground', {
        spec,
        startedAtEpoch: startedAt.current,
        status: engine.status,
        elapsedMs: engine.elapsed * 1000,
        snapshotEpoch: Date.now(),
        taggedHabitId,
      });
    }
  }, [engine.status, engine.elapsed, spec, taggedHabitId]);

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
      // This listener outlives the run screen (mini-player + any tab), so it
      // must never steal keys from a focused input elsewhere in the app.
      if (isTypingTarget(e.target)) return;
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
