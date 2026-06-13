import { prune } from './store';

const SWEEP_MS = 60_000;

/** Periodically drop finished/stale cards past their TTL. Returns a stop() fn. */
export function startSweep(): () => void {
  const id = setInterval(() => prune(Date.now()), SWEEP_MS);
  return () => clearInterval(id);
}
