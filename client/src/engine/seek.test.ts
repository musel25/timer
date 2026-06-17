import { describe, expect, it } from 'vitest';
import { buildPhases } from './buildPhases';
import { seekToElapsed, completedWorkSeconds } from './seek';
import type { RunSpec } from '../lib/types';

const simple = (total: number, prep = 0): RunSpec => ({
  type: 'simple',
  label: 'Focus',
  plannedSeconds: total,
  config: { totalSeconds: total, prepSeconds: prep },
});

describe('seekToElapsed', () => {
  it('returns the start of the run for zero elapsed', () => {
    const phases = buildPhases(simple(600));
    expect(seekToElapsed(phases, 0)).toEqual({ index: 0, remainingMs: 600_000, done: false });
  });

  it('lands inside the current phase with the right remaining time', () => {
    const phases = buildPhases(simple(600));
    expect(seekToElapsed(phases, 120)).toEqual({ index: 0, remainingMs: 480_000, done: false });
  });

  it('crosses prep into the work phase', () => {
    const phases = buildPhases(simple(600, 5)); // prep(5) + work(600)
    // 7s in: 5s prep done, 2s into work → 598s left of work, index 1
    expect(seekToElapsed(phases, 7)).toEqual({ index: 1, remainingMs: 598_000, done: false });
  });

  it('walks interval phases to the correct set', () => {
    const phases = buildPhases({
      type: 'interval',
      label: 'HIIT',
      plannedSeconds: 0,
      config: {
        prepSeconds: 0,
        sets: 3,
        cooldownSeconds: 0,
        intervals: [
          { label: 'Work', seconds: 40, kind: 'work', color: '#22c55e' },
          { label: 'Rest', seconds: 20, kind: 'rest', color: '#3b82f6' },
        ],
      },
    });
    // phases: W40 R20 W40 R20 W40 R20 finish. 70s in → 60 done (set1), 10s into set2 work.
    expect(seekToElapsed(phases, 70)).toEqual({ index: 2, remainingMs: 30_000, done: false });
  });

  it('reports done when elapsed reaches or exceeds the total', () => {
    const phases = buildPhases(simple(600));
    expect(seekToElapsed(phases, 600).done).toBe(true);
    expect(seekToElapsed(phases, 999).done).toBe(true);
  });

  it('clamps negative elapsed to the start', () => {
    const phases = buildPhases(simple(600));
    expect(seekToElapsed(phases, -5)).toEqual({ index: 0, remainingMs: 600_000, done: false });
  });
});

describe('completedWorkSeconds', () => {
  it('sums only work phases fully completed before the resume index', () => {
    const phases = buildPhases({
      type: 'interval',
      label: 'HIIT',
      plannedSeconds: 0,
      config: {
        prepSeconds: 0,
        sets: 3,
        cooldownSeconds: 0,
        intervals: [
          { label: 'Work', seconds: 40, kind: 'work', color: '#22c55e' },
          { label: 'Rest', seconds: 20, kind: 'rest', color: '#3b82f6' },
        ],
      },
    });
    // Resuming at index 2 (set-2 work): only set-1 work (40s) is fully done.
    expect(completedWorkSeconds(phases, 2)).toBe(40);
    // Resuming at index 4 (set-3 work): set-1 + set-2 work = 80s.
    expect(completedWorkSeconds(phases, 4)).toBe(80);
  });
});
