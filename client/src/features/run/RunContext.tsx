import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RunSpec } from '../../lib/types';
import { unlockAudio, requestNotificationPermission } from '../../engine/audio';
import { ActiveRun } from './ActiveRun';
import { loadRun, saveRun, liveElapsedMs, isStale } from './activeRunStore';

interface RunSlot {
  spec: RunSpec;
  key: number;
  startedAtEpoch: number;
  resumeElapsed: number;
  taggedHabitId: string | null;
}

/** Read model the UI uses to reflect/control the one running timer. */
export interface ActiveRunInfo {
  label: string;
  taggedHabitId: string | null;
  running: boolean;
}

interface RunCtx {
  /** Start the single shared run (habit timer, focus block, or ad-hoc). Replaces any current run. */
  startRun: (spec: RunSpec) => void;
  /** Attribute the *current* run to a habit (or clear it) without restarting it. */
  setTag: (habitId: string | null) => void;
  /** The one running timer, if any. */
  activeRun: ActiveRunInfo | null;
}

const Ctx = createContext<RunCtx>({ startRun: () => {}, setTag: () => {}, activeRun: null });
export const useRun = () => useContext(Ctx);

/**
 * Holds the single run above the router, so the engine keeps ticking while the user
 * navigates and survives reload (snapshot in activeRunStore, resumed live). Any habit
 * tapped while a run is active re-tags it via {@link setTag} rather than starting a
 * second timer.
 */
export function RunProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<RunSlot | null>(null);
  const keyRef = useRef(0);

  // Rehydrate a persisted run once on mount — resume exactly where wall-clock says.
  useEffect(() => {
    const now = Date.now();
    const g = loadRun('foreground');
    if (g && g.status !== 'done' && !isStale(g, now)) {
      keyRef.current += 1;
      setRun({
        spec: g.spec,
        key: keyRef.current,
        startedAtEpoch: g.startedAtEpoch,
        resumeElapsed: liveElapsedMs(g, now) / 1000,
        taggedHabitId: g.taggedHabitId ?? null,
      });
    } else if (g) saveRun('foreground', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRun = useCallback((s: RunSpec) => {
    unlockAudio(); // inside the click gesture — unlock audio for mobile
    requestNotificationPermission();
    keyRef.current += 1;
    setRun({ spec: s, key: keyRef.current, startedAtEpoch: Date.now(), resumeElapsed: 0, taggedHabitId: s.habitId ?? null });
  }, []);

  const setTag = useCallback((habitId: string | null) => {
    setRun((r) => (r ? { ...r, taggedHabitId: habitId } : r));
  }, []);

  const closeRun = useCallback(() => { saveRun('foreground', null); setRun(null); }, []);

  const activeRun: ActiveRunInfo | null = run
    ? { label: run.spec.label, taggedHabitId: run.taggedHabitId, running: true }
    : null;

  return (
    <Ctx.Provider value={{ startRun, setTag, activeRun }}>
      {children}
      {run && (
        <ActiveRun
          key={run.key}
          spec={run.spec}
          startedAtEpoch={run.startedAtEpoch}
          resumeElapsed={run.resumeElapsed}
          taggedHabitId={run.taggedHabitId}
          onClose={closeRun}
          onAgain={startRun}
        />
      )}
    </Ctx.Provider>
  );
}
