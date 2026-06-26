import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RunSpec } from '../../lib/types';
import { unlockAudio, requestNotificationPermission } from '../../engine/audio';
import { ActiveRun } from './ActiveRun';
import { loadRun, saveRun, liveElapsedMs, isStale } from './activeRunStore';

interface RunSlot { spec: RunSpec; key: number; startedAtEpoch: number; resumeElapsed: number }

interface RunCtx {
  /** Start the single shared run (saved timer or quick focus block). Replaces any current run. */
  startRun: (spec: RunSpec) => void;
}

const Ctx = createContext<RunCtx>({ startRun: () => {} });
export const useRun = () => useContext(Ctx);

/**
 * Holds the single run above the router so the engine keeps ticking while the
 * user navigates and survives reload (snapshot in activeRunStore, resumed live).
 * The run shows as a minimized mini-player by default, so the rest of the app
 * stays fully interactive while a timer is going; tap it to expand.
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
      setRun({ spec: g.spec, key: keyRef.current, startedAtEpoch: g.startedAtEpoch, resumeElapsed: liveElapsedMs(g, now) / 1000 });
    } else if (g) saveRun('foreground', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRun = useCallback((s: RunSpec) => {
    unlockAudio(); // inside the click gesture — unlock audio for mobile
    requestNotificationPermission();
    keyRef.current += 1;
    setRun({ spec: s, key: keyRef.current, startedAtEpoch: Date.now(), resumeElapsed: 0 });
  }, []);

  const closeRun = useCallback(() => { saveRun('foreground', null); setRun(null); }, []);

  return (
    <Ctx.Provider value={{ startRun }}>
      {children}
      {run && (
        <ActiveRun
          key={run.key}
          spec={run.spec}
          startedAtEpoch={run.startedAtEpoch}
          resumeElapsed={run.resumeElapsed}
          onClose={closeRun}
          onAgain={startRun}
        />
      )}
    </Ctx.Provider>
  );
}
