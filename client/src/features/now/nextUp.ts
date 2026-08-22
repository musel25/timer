import type { Thread } from '../../lib/types';

/** Threads still on the board (not finished). */
export const inFlight = (threads: Thread[]): Thread[] => threads.filter((t) => t.doneAt == null);

/** The one thread you are on, if any. The server guarantees at most one. */
export const activeThread = (threads: Thread[]): Thread | null =>
  inFlight(threads).find((t) => t.state === 'active') ?? null;

/** A waiting thread whose timer has come due — the thing you must not forget. */
export const isReady = (t: Thread, now: number): boolean =>
  t.doneAt == null && t.state === 'waiting' && t.wakeAt != null && t.wakeAt <= now;

export const readyCount = (threads: Thread[], now: number): number =>
  threads.filter((t) => isReady(t, now)).length;

/** True once the board is full: adding another thread must be refused. */
export const atCap = (threads: Thread[], limit: number): boolean => inFlight(threads).length >= limit;

/**
 * What to pick up next. Deliberately deterministic — the whole point is that the
 * switch between threads costs no decision.
 *
 *   1. The thread that has been ready longest (its timer fired first).
 *   2. Otherwise the parked thread untouched for longest.
 *   3. Otherwise nothing.
 *
 * The active thread is never suggested: you are already on it.
 */
export function nextUp(threads: Thread[], now: number): { thread: Thread; reason: 'ready' | 'stalest' } | null {
  const live = inFlight(threads).filter((t) => t.state !== 'active');

  const ready = live.filter((t) => isReady(t, now)).sort((a, b) => (a.wakeAt ?? 0) - (b.wakeAt ?? 0));
  if (ready.length) return { thread: ready[0], reason: 'ready' };

  const parked = live.filter((t) => t.state === 'parked').sort((a, b) => a.touchedAt - b.touchedAt);
  if (parked.length) return { thread: parked[0], reason: 'stalest' };

  return null;
}
