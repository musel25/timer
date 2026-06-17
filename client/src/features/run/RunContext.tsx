import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RunSpec } from '../../lib/types';
import { unlockAudio, requestNotificationPermission } from '../../engine/audio';
import { ActiveRun } from './ActiveRun';
import { FocusRun } from './FocusRun';
import { loadRun, saveRun, liveElapsedMs, isStale } from './activeRunStore';

interface FocusSlot { spec: RunSpec; focusId: string; startedAtEpoch: number; resumeElapsed: number }
interface ForegroundSlot { spec: RunSpec; key: number; startedAtEpoch: number; resumeElapsed: number; parentFocusId: string | null }

interface RunCtx {
  /** Start a foreground timer (habit or ad-hoc). Tagged to the active focus session, if any. */
  startRun: (spec: RunSpec) => void;
  /** Start the background focus "umbrella" countdown. */
  startFocus: (minutes: number, label?: string) => void;
  focusActive: boolean;
}

const Ctx = createContext<RunCtx>({ startRun: () => {}, startFocus: () => {}, focusActive: false });
export const useRun = () => useContext(Ctx);

/**
 * Holds up to two concurrent runs above the router: one background `focus`
 * umbrella + one `foreground` timer. Both survive navigation (engines live in
 * the child components) and reload (snapshots in activeRunStore, resumed live).
 */
export function RunProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<FocusSlot | null>(null);
  const [fg, setFg] = useState<ForegroundSlot | null>(null);
  const keyRef = useRef(0);
  const focusRef = useRef<FocusSlot | null>(null);
  focusRef.current = focus;

  // Rehydrate persisted runs once on mount — resume exactly where wall-clock says.
  useEffect(() => {
    const now = Date.now();
    const f = loadRun('focus');
    if (f?.focusId && f.status !== 'done' && !isStale(f, now)) {
      setFocus({ spec: f.spec, focusId: f.focusId, startedAtEpoch: f.startedAtEpoch, resumeElapsed: liveElapsedMs(f, now) / 1000 });
    } else if (f) saveRun('focus', null);

    const g = loadRun('foreground');
    if (g && g.status !== 'done' && !isStale(g, now)) {
      keyRef.current += 1;
      setFg({ spec: g.spec, key: keyRef.current, startedAtEpoch: g.startedAtEpoch, resumeElapsed: liveElapsedMs(g, now) / 1000, parentFocusId: g.parentFocusId ?? null });
    } else if (g) saveRun('foreground', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRun = useCallback((s: RunSpec) => {
    unlockAudio(); // inside the click gesture — unlock audio for mobile
    requestNotificationPermission();
    keyRef.current += 1;
    setFg({ spec: s, key: keyRef.current, startedAtEpoch: Date.now(), resumeElapsed: 0, parentFocusId: focusRef.current?.focusId ?? null });
  }, []);

  const startFocus = useCallback((minutes: number, label = 'Focus session') => {
    unlockAudio();
    requestNotificationPermission();
    const secs = Math.max(1, Math.round(minutes)) * 60;
    setFocus({
      spec: { type: 'simple', label, plannedSeconds: secs, config: { totalSeconds: secs, prepSeconds: 0 } },
      focusId: crypto.randomUUID(),
      startedAtEpoch: Date.now(),
      resumeElapsed: 0,
    });
  }, []);

  const closeFg = useCallback(() => { saveRun('foreground', null); setFg(null); }, []);
  const closeFocus = useCallback(() => { saveRun('focus', null); setFocus(null); }, []);

  return (
    <Ctx.Provider value={{ startRun, startFocus, focusActive: !!focus }}>
      {children}
      {focus && (
        <FocusRun
          key={focus.focusId}
          spec={focus.spec}
          focusId={focus.focusId}
          startedAtEpoch={focus.startedAtEpoch}
          resumeElapsed={focus.resumeElapsed}
          onClose={closeFocus}
        />
      )}
      {fg && (
        <ActiveRun
          key={fg.key}
          spec={fg.spec}
          startedAtEpoch={fg.startedAtEpoch}
          resumeElapsed={fg.resumeElapsed}
          parentFocusId={fg.parentFocusId}
          onClose={closeFg}
          onAgain={startRun}
        />
      )}
    </Ctx.Provider>
  );
}
