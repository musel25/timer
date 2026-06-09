import { describe, expect, it } from 'vitest';
import { buildPhases, buildPomodoroPhases, totalSeconds, workSeconds } from './buildPhases';
import type { RunSpec } from '../lib/types';

describe('buildPhases', () => {
  it('builds prep + work + finish for a simple timer', () => {
    const spec: RunSpec = {
      type: 'simple',
      label: 'Reading',
      plannedSeconds: 600,
      config: { totalSeconds: 600, prepSeconds: 5 },
    };
    const phases = buildPhases(spec);
    expect(phases.map((p) => p.kind)).toEqual(['prep', 'work', 'finish']);
    expect(phases[1].label).toBe('Reading');
    expect(phases[1].seconds).toBe(600);
    expect(totalSeconds(phases)).toBe(605);
  });

  it('omits prep when prepSeconds is 0', () => {
    const phases = buildPhases({ type: 'simple', label: 'x', plannedSeconds: 60, config: { totalSeconds: 60, prepSeconds: 0 } });
    expect(phases.map((p) => p.kind)).toEqual(['work', 'finish']);
  });

  it('expands interval sets in order with cooldown', () => {
    const spec: RunSpec = {
      type: 'interval',
      label: 'HIIT',
      plannedSeconds: 0,
      config: {
        prepSeconds: 10,
        sets: 3,
        cooldownSeconds: 30,
        intervals: [
          { label: 'Work', seconds: 40, kind: 'work', color: '#22c55e' },
          { label: 'Rest', seconds: 20, kind: 'rest', color: '#3b82f6' },
        ],
      },
    };
    const phases = buildPhases(spec);
    // prep + 3*(work,rest) + cooldown + finish
    expect(phases.length).toBe(1 + 3 * 2 + 1 + 1);
    expect(phases[0].kind).toBe('prep');
    expect(phases.at(-2)!.kind).toBe('cooldown');
    expect(phases.at(-1)!.kind).toBe('finish');
    expect(phases[1].setIndex).toBe(1);
    expect(phases[3].setIndex).toBe(2);
    // 10 + 3*(40+20) + 30 = 220
    expect(totalSeconds(phases)).toBe(220);
  });
});

describe('buildPomodoroPhases', () => {
  it('alternates work and breaks with a long break every N pomodoros', () => {
    const phases = buildPomodoroPhases({ work: 25, short: 5, long: 20, longEvery: 2, rounds: 4 }, 'Study');
    expect(phases.map((p) => p.kind)).toEqual(['work', 'rest', 'work', 'cooldown', 'work', 'rest', 'work', 'finish']);
    expect(phases[0].label).toBe('Study');
    expect(workSeconds(phases)).toBe(4 * 25 * 60);
    // 4*1500 work + 5m + 20m + 5m breaks
    expect(totalSeconds(phases)).toBe(6000 + 300 + 1200 + 300);
  });

  it('adds an optional prep and never trails a break after the last pomodoro', () => {
    const phases = buildPomodoroPhases({ work: 1, short: 1, long: 1, longEvery: 4, rounds: 1 }, '', 10);
    expect(phases.map((p) => p.kind)).toEqual(['prep', 'work', 'finish']);
  });
});
