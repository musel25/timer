import { useCallback, useEffect, useRef, useState } from 'react';
import type { Phase } from '../lib/types';
import { audio } from './audio';
import { setWorkerTimeout, clearWorkerTimeout, setWorkerInterval, clearWorkerInterval } from './workerTimer';

export type EngineStatus = 'idle' | 'running' | 'paused' | 'done';

export interface EngineOptions {
  beeps: boolean;
  voice: boolean;
  onFinish: (elapsedSeconds: number, completed: boolean) => void;
  /** Fired for each phase that finishes by counting down naturally (not via skip). */
  onPhaseComplete?: (phase: Phase) => void;
}

export interface EngineState {
  status: EngineStatus;
  phaseIndex: number;
  phase: Phase;
  nextPhase: Phase | null;
  remaining: number; // whole seconds left in the current phase
  remainingMs: number;
  fraction: number; // 0..1 elapsed within the current phase
  totalRemaining: number; // whole seconds left overall
  elapsed: number; // whole seconds of active time
  start: () => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  addTime: (sec: number) => void;
  stop: (completed: boolean) => void;
}

/**
 * Drift-free interval engine. Time is derived from `performance.now()` deltas, so
 * accuracy doesn't degrade over a long run, and a backgrounded tab catches up
 * (possibly across several phases) the moment it becomes visible again.
 */
export function useTimerEngine(phases: Phase[], opts: EngineOptions): EngineState {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const phasesRef = useRef(phases);

  const idxRef = useRef(0);
  const remRef = useRef((phases[0]?.seconds ?? 0) * 1000);
  const elapsedRef = useRef(0);
  const lastRef = useRef(0);
  const rafRef = useRef(0);
  const beepSecRef = useRef(-1);
  const dispSecRef = useRef(-1);
  const dispIdxRef = useRef(-1);
  // Wall-clock alarm for the true finish time. It runs in a Web Worker because
  // hidden tabs throttle main-thread timers (Chrome: once per minute after ~5 min
  // hidden), which delayed the finish sound + notification when the user was on
  // another tab. Worker timers are exempt from that throttling.
  const alarmRef = useRef<number | undefined>(undefined);
  // Worker-driven heartbeat that advances the engine while the tab is hidden:
  // requestAnimationFrame freezes entirely in background tabs, which silenced
  // every phase cue and countdown beep until the user came back. The heartbeat
  // shares the same dt-based advance as the rAF loop, so running both is safe.
  const heartbeatRef = useRef<number | undefined>(undefined);

  const [, force] = useState(0);
  const [status, setStatus] = useState<EngineStatus>('idle');
  const rerender = () => force((n) => (n + 1) & 0xffff);

  const announce = useCallback((p: Phase) => {
    if (p.kind === 'work') audio.work();
    else if (p.kind === 'rest') audio.rest();
    // Delay the prep sequence so the GO blast fires exactly at the phase boundary.
    else if (p.kind === 'prep') audio.prep(Math.max(0, p.seconds - 1.65));
    else if (p.kind === 'cooldown') audio.cooldown();
    if (optsRef.current.voice && p.kind !== 'finish' && p.kind !== 'prep') {
      const text = p.kind === 'work' && p.setCount && p.setCount > 1 ? `${p.label}, set ${p.setIndex}` : p.label;
      audio.speak(text);
    }
  }, []);

  const clearAlarm = useCallback(() => {
    if (alarmRef.current !== undefined) {
      clearWorkerTimeout(alarmRef.current);
      alarmRef.current = undefined;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== undefined) {
      clearWorkerInterval(heartbeatRef.current);
      heartbeatRef.current = undefined;
    }
  }, []);

  const finish = useCallback(
    (completed: boolean) => {
      clearAlarm();
      clearHeartbeat();
      cancelAnimationFrame(rafRef.current);
      setStatus('done');
      if (completed) {
        // A completed run lasted its full planned duration; a backgrounded tab froze the
        // tick loop, so trust the larger of accumulated time and the planned total.
        const plannedMs = phasesRef.current.reduce((a, p) => a + (p.kind === 'finish' ? 0 : p.seconds * 1000), 0);
        elapsedRef.current = Math.max(elapsedRef.current, plannedMs);
        audio.finish();
        if (typeof document !== 'undefined' && document.hidden) audio.notify("Time's up ⏱", 'Your timer finished.');
      }
      optsRef.current.onFinish(Math.round(elapsedRef.current / 1000), completed);
    },
    [clearAlarm, clearHeartbeat],
  );

  // (Re)arm the wall-clock alarm for the remaining active time across all upcoming phases.
  const scheduleAlarm = useCallback(() => {
    clearAlarm();
    const ph = phasesRef.current;
    let ms = Math.max(0, remRef.current);
    for (let i = idxRef.current + 1; i < ph.length; i++) {
      if (ph[i].kind !== 'finish') ms += ph[i].seconds * 1000;
    }
    alarmRef.current = setWorkerTimeout(() => {
      alarmRef.current = undefined;
      finish(true);
    }, ms);
  }, [clearAlarm, finish]);

  // Advance the engine by however much wall time passed. Pure dt bookkeeping, so
  // it can be driven by both the rAF loop (visible) and the worker heartbeat
  // (hidden) without double-counting. Returns false once the run has finished.
  const advance = useCallback((): boolean => {
    const now = performance.now();
    const dt = now - lastRef.current;
    lastRef.current = now;
    remRef.current -= dt;
    elapsedRef.current += dt;

    const ph = phasesRef.current;
    while (remRef.current <= 0 && idxRef.current < ph.length - 1) {
      const carry = -remRef.current;
      optsRef.current.onPhaseComplete?.(ph[idxRef.current]);
      idxRef.current += 1;
      beepSecRef.current = -1;
      const next = ph[idxRef.current];
      if (next.kind === 'finish') {
        elapsedRef.current -= carry;
        finish(true);
        rerender();
        return false;
      }
      announce(next);
      remRef.current = next.seconds * 1000 - carry;
    }

    const secLeft = Math.ceil(remRef.current / 1000);
    if (secLeft !== beepSecRef.current) {
      beepSecRef.current = secLeft;
      const cur = ph[idxRef.current];
      if (optsRef.current.beeps && cur.seconds > 3 && secLeft <= 3 && secLeft >= 1) {
        // Schedule the last beep on the audio clock so it fires exactly when the
        // phase ends — not up to a second early like a plain audio.beep() would.
        if (secLeft === 1) audio.beepAt(remRef.current / 1000);
        else audio.beep();
      }
    }

    // Re-render at most once per displayed second (CSS handles smooth ring motion).
    if (secLeft !== dispSecRef.current || idxRef.current !== dispIdxRef.current) {
      dispSecRef.current = secLeft;
      dispIdxRef.current = idxRef.current;
      rerender();
    }
    return true;
  }, [announce, finish]);

  const tick = useCallback(() => {
    if (advance()) rafRef.current = requestAnimationFrame(tick);
  }, [advance]);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatRef.current = setWorkerInterval(() => {
      advance();
    }, 250);
  }, [advance, clearHeartbeat]);

  const start = useCallback(() => {
    if (status !== 'idle') return;
    elapsedRef.current = 0;
    setStatus('running');
    lastRef.current = performance.now();
    const first = phasesRef.current[0];
    if (first && first.kind !== 'finish') announce(first);
    scheduleAlarm();
    startHeartbeat();
    rafRef.current = requestAnimationFrame(tick);
  }, [status, announce, tick, scheduleAlarm, startHeartbeat]);

  const pause = useCallback(() => {
    if (status !== 'running') return;
    cancelAnimationFrame(rafRef.current);
    clearAlarm();
    clearHeartbeat();
    setStatus('paused');
  }, [status, clearAlarm, clearHeartbeat]);

  const resume = useCallback(() => {
    if (status !== 'paused') return;
    lastRef.current = performance.now();
    setStatus('running');
    scheduleAlarm();
    startHeartbeat();
    rafRef.current = requestAnimationFrame(tick);
  }, [status, tick, scheduleAlarm, startHeartbeat]);

  const toggle = useCallback(() => {
    if (status === 'idle') start();
    else if (status === 'running') pause();
    else if (status === 'paused') resume();
  }, [status, start, pause, resume]);

  const skipNext = useCallback(() => {
    const ph = phasesRef.current;
    if (idxRef.current >= ph.length - 1) return;
    idxRef.current += 1;
    beepSecRef.current = -1;
    const next = ph[idxRef.current];
    if (next.kind === 'finish') {
      finish(false);
      rerender();
      return;
    }
    remRef.current = next.seconds * 1000;
    announce(next);
    if (status === 'running') scheduleAlarm();
    rerender();
  }, [announce, finish, scheduleAlarm, status]);

  const skipPrev = useCallback(() => {
    const ph = phasesRef.current;
    const cur = ph[idxRef.current];
    const elapsedInPhase = cur.seconds * 1000 - remRef.current;
    if (elapsedInPhase > 1200 || idxRef.current === 0) {
      remRef.current = cur.seconds * 1000;
    } else {
      idxRef.current -= 1;
      remRef.current = ph[idxRef.current].seconds * 1000;
    }
    beepSecRef.current = -1;
    if (status === 'running') scheduleAlarm();
    rerender();
  }, [scheduleAlarm, status]);

  const addTime = useCallback((sec: number) => {
    remRef.current = Math.max(0, remRef.current + sec * 1000);
    if (status === 'running') scheduleAlarm();
    rerender();
  }, [scheduleAlarm, status]);

  const stop = useCallback((completed: boolean) => finish(completed), [finish]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    clearAlarm();
    clearHeartbeat();
  }, [clearAlarm, clearHeartbeat]);

  const ph = phasesRef.current;
  const idx = idxRef.current;
  const phase = ph[idx] ?? ph[ph.length - 1];
  const nextPhase = idx + 1 < ph.length && ph[idx + 1].kind !== 'finish' ? ph[idx + 1] : null;
  const futureSeconds = ph.slice(idx + 1).reduce((a, p) => a + (p.kind === 'finish' ? 0 : p.seconds), 0);
  const remainingMs = Math.max(0, remRef.current);
  const fraction = phase && phase.seconds > 0 ? 1 - remainingMs / (phase.seconds * 1000) : 0;

  return {
    status,
    phaseIndex: idx,
    phase,
    nextPhase,
    remaining: Math.max(0, Math.ceil(remainingMs / 1000)),
    remainingMs,
    fraction: Math.min(1, Math.max(0, fraction)),
    totalRemaining: Math.max(0, Math.ceil(remainingMs / 1000) + futureSeconds),
    elapsed: Math.round(elapsedRef.current / 1000),
    start,
    pause,
    resume,
    toggle,
    skipNext,
    skipPrev,
    addTime,
    stop,
  };
}
