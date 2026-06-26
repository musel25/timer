import { beforeEach, describe, expect, it } from 'vitest';
import { liveElapsedMs, isStale, loadRun, saveRun, type PersistedRun } from './activeRunStore';
import type { RunSpec } from '../../lib/types';

const spec: RunSpec = { type: 'simple', label: 'Focus', plannedSeconds: 3600, config: { totalSeconds: 3600, prepSeconds: 0 } };

const run = (over: Partial<PersistedRun> = {}): PersistedRun => ({
  spec,
  startedAtEpoch: 1_000_000,
  status: 'running',
  elapsedMs: 60_000,
  snapshotEpoch: 1_100_000,
  ...over,
});

describe('liveElapsedMs', () => {
  it('keeps counting wall-clock while a running snapshot ages', () => {
    // snapshot captured 60s elapsed at t=1_100_000; 30s of wall-clock later → 90s.
    expect(liveElapsedMs(run(), 1_130_000)).toBe(90_000);
  });

  it('freezes at the snapshot when paused', () => {
    expect(liveElapsedMs(run({ status: 'paused' }), 1_130_000)).toBe(60_000);
  });

  it('clamps to zero on backwards clock skew (now before snapshot)', () => {
    expect(liveElapsedMs(run({ snapshotEpoch: 2_000_000 }), 1_000_000)).toBe(0);
  });
});

describe('isStale', () => {
  it('is true past 24h since the run started', () => {
    expect(isStale(run(), 1_000_000 + 25 * 3600_000)).toBe(true);
    expect(isStale(run(), 1_000_000 + 1 * 3600_000)).toBe(false);
  });
});

describe('save/load round trip', () => {
  beforeEach(() => localStorage.clear());

  it('persists and reads back the active run', () => {
    saveRun(run({ elapsedMs: 5000 }));
    expect(loadRun()?.elapsedMs).toBe(5000);
  });

  it('clears the run when saved null', () => {
    saveRun(run());
    saveRun(null);
    expect(loadRun()).toBeNull();
  });

  it('returns null for an empty store', () => {
    expect(loadRun()).toBeNull();
  });
});
