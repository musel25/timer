/**
 * Tracks how much of the active run's elapsed time has already been logged to a
 * habit, so the next log offers only the *uncommitted* remainder (lap behavior).
 * Keyed by run identity so it self-invalidates when the run changes. Persisted
 * to localStorage to survive a reload mid-lap.
 */
const KEY = 'timer_log_checkpoint';

export interface LogCheckpoint {
  /** Identity of the run this checkpoint belongs to (`fg:<startedAtEpoch>` or `focus:<focusId>`). */
  runKey: string;
  /** Active elapsed ms already logged to a habit at the last checkpoint. */
  loggedMs: number;
}

export function loadCheckpoint(): LogCheckpoint | null {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as LogCheckpoint | null) ?? null;
  } catch {
    return null;
  }
}

export function saveCheckpoint(cp: LogCheckpoint | null): void {
  try {
    if (cp) localStorage.setItem(KEY, JSON.stringify(cp));
    else localStorage.removeItem(KEY);
  } catch {
    // best-effort; private mode / quota
  }
}
