import { useEffect, useMemo, useRef } from 'react';
import type { RunSpec } from '../../lib/types';
import { useSettings } from '../../lib/hooks';
import { logSession } from '../../lib/offlineQueue';
import { buildPhases, totalSeconds } from '../../engine/buildPhases';
import { useTimerEngine } from '../../engine/useTimerEngine';
import { unlockAudio } from '../../engine/audio';
import { requestWakeLock, releaseWakeLock } from '../../engine/wakeLock';
import { saveRun } from './activeRunStore';
import { FocusBar } from './FocusBar';

/**
 * Owns the background "focus session" engine — a long simple countdown that runs
 * underneath foreground habit timers. Logs its own session (category='focus') so
 * total focus time shows in stats, and persists a snapshot every second so the
 * block resumes live after a reload. Habit runs started while this is active are
 * tagged with this session's id (see RunContext / ActiveRun).
 */
export function FocusRun({
  spec,
  focusId,
  startedAtEpoch,
  resumeElapsed = 0,
  onClose,
}: {
  spec: RunSpec;
  focusId: string;
  startedAtEpoch: number;
  resumeElapsed?: number;
  onClose: () => void;
}) {
  const { data: settings } = useSettings();
  const phases = useMemo(() => buildPhases(spec), [spec]);
  const planned = useMemo(() => spec.plannedSeconds || totalSeconds(phases), [phases, spec]);
  const startedAt = useRef(startedAtEpoch);
  const elapsedRef = useRef(resumeElapsed);
  const logged = useRef(false);

  function log(completed: boolean, elapsed: number) {
    if (logged.current) return;
    logged.current = true;
    void logSession({
      id: focusId,
      habitId: null,
      timerId: null,
      label: spec.label,
      type: 'simple',
      plannedSeconds: planned,
      actualSeconds: elapsed,
      completed,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      note: null,
      category: 'focus',
      parentSessionId: null,
      createdAt: Date.now(),
    });
    saveRun('focus', null);
  }

  const engine = useTimerEngine(phases, {
    beeps: settings?.beeps ?? true,
    voice: false,
    resumeElapsedSeconds: resumeElapsed,
    onFinish: (elapsed, completed) => {
      log(completed, elapsed);
      onClose();
    },
  });
  elapsedRef.current = engine.elapsed;

  // Auto-start + keep the screen awake while a focus session runs.
  useEffect(() => {
    unlockAudio();
    engine.start();
    if (settings?.keepAwake ?? true) void requestWakeLock();
    return () => {
      void releaseWakeLock();
      // Safety net: if the slot is torn down without an explicit stop, still log it.
      if (!logged.current) log(false, elapsedRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a snapshot each displayed second so a reload resumes where we are.
  useEffect(() => {
    if (engine.status === 'running' || engine.status === 'paused') {
      saveRun('focus', {
        spec,
        startedAtEpoch: startedAt.current,
        status: engine.status,
        elapsedMs: engine.elapsed * 1000,
        snapshotEpoch: Date.now(),
        focusId,
      });
    }
  }, [engine.status, engine.elapsed, spec, focusId]);

  function stop() {
    if (engine.status !== 'done') log(false, engine.elapsed);
    onClose();
  }

  if (engine.status === 'done') return null;
  return <FocusBar label={spec.label} engine={engine} onStop={stop} />;
}
