import type { RunSpec } from '../../lib/types';

/**
 * A live run snapshot persisted to localStorage so it survives a reload. We store
 * the active elapsed time captured at `snapshotEpoch`; on rehydrate we add the
 * wall-clock gap since then (when running) to resume exactly where we'd be.
 */
export interface PersistedRun {
  spec: RunSpec;
  /** Wall-clock the run originally started — becomes the logged session's startedAt. */
  startedAtEpoch: number;
  status: 'running' | 'paused' | 'done';
  /** Active elapsed ms captured at `snapshotEpoch`. */
  elapsedMs: number;
  snapshotEpoch: number;
}

const KEY = 'timer_active_run';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Elapsed ms a run is really at `now`: running runs keep counting wall-clock. */
export function liveElapsedMs(run: PersistedRun, now: number): number {
  if (run.status === 'running') return Math.max(0, run.elapsedMs + (now - run.snapshotEpoch));
  return Math.max(0, run.elapsedMs);
}

/** A run older than a day is almost certainly abandoned — don't auto-resume it. */
export function isStale(run: PersistedRun, now: number): boolean {
  return now - run.startedAtEpoch > MAX_AGE_MS;
}

export function loadRun(): PersistedRun | null {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as PersistedRun | null) ?? null;
  } catch {
    return null;
  }
}

export function saveRun(run: PersistedRun | null): void {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode / quota — persistence is best-effort.
  }
}
