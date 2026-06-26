import { beforeEach, describe, expect, it } from 'vitest';
import { saveRun, type PersistedRun } from './activeRunStore';
import { saveCheckpoint } from './logCheckpoint';
import { resolveActiveRun, uncommittedElapsedSec, checkpointActive } from './activeElapsed';
import type { RunSpec } from '../../lib/types';

const spec: RunSpec = { type: 'simple', label: 'X', plannedSeconds: 3600, config: { totalSeconds: 3600, prepSeconds: 0 } };
const NOW = 2_000_000;

// A running snapshot whose live elapsed at NOW equals `sec` seconds (snapshot taken at NOW).
const running = (sec: number, over: Partial<PersistedRun> = {}): PersistedRun => ({
  spec,
  startedAtEpoch: 1_000_000,
  status: 'running',
  elapsedMs: sec * 1000,
  snapshotEpoch: NOW,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('uncommittedElapsedSec', () => {
  it('is 0 with no active run', () => {
    expect(uncommittedElapsedSec(NOW)).toBe(0);
  });
  it('returns full elapsed when nothing is logged yet', () => {
    saveRun('foreground', running(600));
    expect(uncommittedElapsedSec(NOW)).toBe(600);
  });
  it('prefers the foreground run over the focus umbrella', () => {
    saveRun('focus', running(1800, { focusId: 'f1' }));
    saveRun('foreground', running(120));
    expect(uncommittedElapsedSec(NOW)).toBe(120);
  });
  it('falls back to the focus umbrella when no foreground run', () => {
    saveRun('focus', running(300, { focusId: 'f1' }));
    expect(uncommittedElapsedSec(NOW)).toBe(300);
  });
  it('subtracts a checkpoint that matches the current run', () => {
    saveRun('foreground', running(600));
    saveCheckpoint({ runKey: 'fg:1000000', loggedMs: 360_000 });
    expect(uncommittedElapsedSec(NOW)).toBe(240);
  });
  it('ignores a checkpoint from a different (earlier) run', () => {
    saveRun('foreground', running(600, { startedAtEpoch: 1_500_000 }));
    saveCheckpoint({ runKey: 'fg:1000000', loggedMs: 360_000 });
    expect(uncommittedElapsedSec(NOW)).toBe(600);
  });
});

describe('checkpointActive (lap reset)', () => {
  it('drives uncommitted elapsed to 0 right after a log', () => {
    saveRun('foreground', running(600));
    checkpointActive(NOW);
    expect(uncommittedElapsedSec(NOW)).toBe(0);
  });
  it('is a no-op when no run is active', () => {
    checkpointActive(NOW);
    expect(localStorage.getItem('timer_log_checkpoint')).toBeNull();
  });
});

describe('resolveActiveRun', () => {
  it('returns null when the only run is done', () => {
    saveRun('foreground', running(600, { status: 'done' }));
    expect(resolveActiveRun()).toBeNull();
  });
});
