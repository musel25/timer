import { useCallback, useEffect, useRef, useState } from 'react';
import type { Phase } from '../lib/types';
import { audio } from './audio';

export type EngineStatus = 'idle' | 'running' | 'paused' | 'done';

export interface EngineOptions {
  beeps: boolean;
  voice: boolean;
  onFinish: (elapsedSeconds: number, completed: boolean) => void;
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

  const [, force] = useState(0);
  const [status, setStatus] = useState<EngineStatus>('idle');
  const rerender = () => force((n) => (n + 1) & 0xffff);

  const announce = useCallback((p: Phase) => {
    if (p.kind === 'work') audio.work();
    else if (p.kind === 'rest') audio.rest();
    else if (p.kind === 'prep') audio.prep();
    else if (p.kind === 'cooldown') audio.cooldown();
    if (optsRef.current.voice && p.kind !== 'finish') {
      const text = p.kind === 'work' && p.setCount && p.setCount > 1 ? `${p.label}, set ${p.setIndex}` : p.label;
      audio.speak(text);
    }
  }, []);

  const finish = useCallback((completed: boolean) => {
    cancelAnimationFrame(rafRef.current);
    setStatus('done');
    if (completed) audio.finish();
    optsRef.current.onFinish(Math.round(elapsedRef.current / 1000), completed);
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const dt = now - lastRef.current;
    lastRef.current = now;
    remRef.current -= dt;
    elapsedRef.current += dt;

    const ph = phasesRef.current;
    while (remRef.current <= 0 && idxRef.current < ph.length - 1) {
      const carry = -remRef.current;
      idxRef.current += 1;
      beepSecRef.current = -1;
      const next = ph[idxRef.current];
      if (next.kind === 'finish') {
        elapsedRef.current -= carry;
        finish(true);
        rerender();
        return;
      }
      announce(next);
      remRef.current = next.seconds * 1000 - carry;
    }

    const secLeft = Math.ceil(remRef.current / 1000);
    if (secLeft !== beepSecRef.current) {
      beepSecRef.current = secLeft;
      const cur = ph[idxRef.current];
      if (optsRef.current.beeps && cur.seconds > 3 && secLeft <= 3 && secLeft >= 1) audio.beep();
    }

    // Re-render at most once per displayed second (CSS handles smooth ring motion).
    if (secLeft !== dispSecRef.current || idxRef.current !== dispIdxRef.current) {
      dispSecRef.current = secLeft;
      dispIdxRef.current = idxRef.current;
      rerender();
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [announce, finish]);

  const start = useCallback(() => {
    if (status !== 'idle') return;
    elapsedRef.current = 0;
    setStatus('running');
    lastRef.current = performance.now();
    const first = phasesRef.current[0];
    if (first && first.kind !== 'finish') announce(first);
    rafRef.current = requestAnimationFrame(tick);
  }, [status, announce, tick]);

  const pause = useCallback(() => {
    if (status !== 'running') return;
    cancelAnimationFrame(rafRef.current);
    setStatus('paused');
  }, [status]);

  const resume = useCallback(() => {
    if (status !== 'paused') return;
    lastRef.current = performance.now();
    setStatus('running');
    rafRef.current = requestAnimationFrame(tick);
  }, [status, tick]);

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
    rerender();
  }, [announce, finish]);

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
    rerender();
  }, []);

  const addTime = useCallback((sec: number) => {
    remRef.current = Math.max(0, remRef.current + sec * 1000);
    rerender();
  }, []);

  const stop = useCallback((completed: boolean) => finish(completed), [finish]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

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
