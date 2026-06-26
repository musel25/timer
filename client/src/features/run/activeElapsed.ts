import { loadRun, liveElapsedMs, type PersistedRun } from './activeRunStore';
import { loadCheckpoint, saveCheckpoint } from './logCheckpoint';

/** Stable identity for a run snapshot, used to scope log checkpoints to one run. */
function runKeyOf(slot: 'foreground' | 'focus', run: PersistedRun): string {
  return slot === 'foreground' ? `fg:${run.startedAtEpoch}` : `focus:${run.focusId}`;
}

/**
 * The run a habit log should attribute time to: the foreground timer if one is
 * live, else the background focus umbrella, else none ("live" = not done).
 */
export function resolveActiveRun(): { slot: 'foreground' | 'focus'; run: PersistedRun; runKey: string } | null {
  const fg = loadRun('foreground');
  if (fg && fg.status !== 'done') return { slot: 'foreground', run: fg, runKey: runKeyOf('foreground', fg) };
  const focus = loadRun('focus');
  if (focus && focus.status !== 'done') return { slot: 'focus', run: focus, runKey: runKeyOf('focus', focus) };
  return null;
}

/** Uncommitted elapsed seconds of the active run (live elapsed minus already-logged). 0 if none. */
export function uncommittedElapsedSec(now: number): number {
  const active = resolveActiveRun();
  if (!active) return 0;
  const elapsed = liveElapsedMs(active.run, now);
  const cp = loadCheckpoint();
  const logged = cp && cp.runKey === active.runKey ? cp.loggedMs : 0;
  return Math.max(0, (elapsed - logged) / 1000);
}

/** Mark the active run's current elapsed as logged to a habit (lap reset); no-op if no run. */
export function checkpointActive(now: number): void {
  const active = resolveActiveRun();
  if (!active) return;
  saveCheckpoint({ runKey: active.runKey, loggedMs: liveElapsedMs(active.run, now) });
}
