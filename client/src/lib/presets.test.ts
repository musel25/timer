import { describe, expect, it } from 'vitest';
import { runSpecFromPreset, presetSeconds, DEFAULT_POMODORO_PREP } from './presets';
import type { PomodoroConfig, TimerPreset } from './types';

const pomo = (config: Partial<PomodoroConfig> = {}): TimerPreset => ({
  id: 'p1',
  name: 'Focus block',
  type: 'pomodoro',
  config: { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4, ...config },
  sortOrder: 0,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
});

describe('runSpecFromPreset — focus block prep countdown', () => {
  it('prepends a Get Ready prep phase by default (so focus blocks count down like intervals)', () => {
    const spec = runSpecFromPreset(pomo());
    expect(spec.phases?.[0]).toMatchObject({ kind: 'prep', seconds: DEFAULT_POMODORO_PREP });
  });

  it('honours an explicit prepSeconds', () => {
    const spec = runSpecFromPreset(pomo({ prepSeconds: 3 }));
    expect(spec.phases?.[0]).toMatchObject({ kind: 'prep', seconds: 3 });
  });

  it('omits the prep phase when prepSeconds is 0', () => {
    const spec = runSpecFromPreset(pomo({ prepSeconds: 0 }));
    expect(spec.phases?.[0]?.kind).toBe('work');
  });
});

describe('presetSeconds — pomodoro total', () => {
  it('includes the prep countdown in the total span', () => {
    const withPrep = presetSeconds(pomo({ prepSeconds: 10 }));
    const noPrep = presetSeconds(pomo({ prepSeconds: 0 }));
    expect(withPrep - noPrep).toBe(10);
  });
});
