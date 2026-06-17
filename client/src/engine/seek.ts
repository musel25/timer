import type { Phase } from '../lib/types';

export interface SeekResult {
  /** Index of the phase the elapsed time lands in (the phase to resume into). */
  index: number;
  /** Whole milliseconds left in that phase. */
  remainingMs: number;
  /** True when elapsed already reached/exceeded the runnable total. */
  done: boolean;
}

/**
 * Map a total elapsed-seconds offset onto the phase list, so a persisted run can
 * resume mid-flight after a reload. Walks the runnable phases (the zero-length
 * `finish` marker is the terminator) accumulating their durations until the
 * offset lands inside one. Returns `done` when the offset is at/past the end.
 */
export function seekToElapsed(phases: Phase[], elapsedSeconds: number): SeekResult {
  const elapsedMs = Math.max(0, elapsedSeconds) * 1000;
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (p.kind === 'finish') break;
    const durMs = p.seconds * 1000;
    if (elapsedMs < acc + durMs) {
      return { index: i, remainingMs: acc + durMs - elapsedMs, done: false };
    }
    acc += durMs;
  }
  return { index: Math.max(0, phases.length - 1), remainingMs: 0, done: true };
}

/**
 * Work-phase seconds fully completed *before* `beforeIndex`. Used to seed the
 * Pomodoro work-done counter on resume: the engine re-adds the current (partial)
 * work phase in full when it finishes, so the seed must exclude it.
 */
export function completedWorkSeconds(phases: Phase[], beforeIndex: number): number {
  let s = 0;
  for (let i = 0; i < beforeIndex && i < phases.length; i++) {
    if (phases[i].kind === 'work') s += phases[i].seconds;
  }
  return s;
}
