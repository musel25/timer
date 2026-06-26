import type { RunSpec } from '../../lib/types';

/** A single shared run slot. (Was two slots; the focus "umbrella" has been removed.) */
export type RunSlot = 'foreground';

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

const KEY = 'timer_active_runs';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Store = Partial<Record<RunSlot, PersistedRun>>;

function readStore(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store) ?? {};
  } catch {
    return {};
  }
}

function writeStore(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode / quota — persistence is best-effort.
  }
}

/** Elapsed ms a run is really at `now`: running runs keep counting wall-clock. */
export function liveElapsedMs(run: PersistedRun, now: number): number {
  if (run.status === 'running') return Math.max(0, run.elapsedMs + (now - run.snapshotEpoch));
  return Math.max(0, run.elapsedMs);
}

/** A run older than a day is almost certainly abandoned — don't auto-resume it. */
export function isStale(run: PersistedRun, now: number): boolean {
  return now - run.startedAtEpoch > MAX_AGE_MS;
}

export function loadRun(slot: RunSlot): PersistedRun | null {
  return readStore()[slot] ?? null;
}

export function saveRun(slot: RunSlot, run: PersistedRun | null): void {
  const s = readStore();
  if (run) s[slot] = run;
  else delete s[slot];
  writeStore(s);
}
