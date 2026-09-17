import { describe, expect, it } from 'vitest';
import { runSpecFromPreset, presetSeconds, describeBlock, DEFAULT_POMODORO_PREP } from './presets';
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
  it('defaults to a 5s countdown — long enough to put the phone down, short enough not to wait', () => {
    expect(DEFAULT_POMODORO_PREP).toBe(5);
  });

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

describe('describeBlock — what the saved-timer card says out loud', () => {
  it('leads with the set count and the length of one set, not the total', () => {
    const b = describeBlock(pomo({ rounds: 4, work: 25, short: 5 }));
    expect(b.sets).toBe(4);
    expect(b.setLabel).toBe('25 min');
  });

  it('still carries the whole span and the focus time, for the line underneath', () => {
    const b = describeBlock(pomo({ rounds: 4, work: 25, short: 5 }));
    expect(b.totalSeconds).toBe(4 * 25 * 60 + 3 * 5 * 60 + 5);
    expect(b.focusSeconds).toBe(4 * 25 * 60);
  });

  it('puts the break in the detail line, where it belongs', () => {
    expect(describeBlock(pomo({ rounds: 4, work: 25, short: 5 })).detail).toEqual(['5 min break between']);
  });

  it('drops the break line when there is only one set to break between', () => {
    const b = describeBlock(pomo({ rounds: 1 }));
    expect(b.sets).toBe(1);
    expect(b.detail).toEqual([]);
  });

  it('names the long break only when one actually falls inside the block', () => {
    expect(describeBlock(pomo({ rounds: 4, longEvery: 4 })).detail).not.toContain('20 min long break every 4');
    expect(describeBlock(pomo({ rounds: 6, longEvery: 3, long: 20 })).detail).toContain('20 min long break every 3');
  });

  it('describes a plain timer as a single set of its own length', () => {
    const simple: TimerPreset = {
      id: 's1', name: '10 min', type: 'simple', sortOrder: 0, archived: false, createdAt: 0, updatedAt: 0,
      config: { totalSeconds: 600, prepSeconds: 0 },
    };
    const b = describeBlock(simple);
    expect(b.totalSeconds).toBe(600);
    expect(b.sets).toBe(1);
    expect(b.setLabel).toBe('10 min');
    expect(b.detail).toEqual([]);
  });

  it('describes an interval preset by its set count, work length and rest', () => {
    const iv: TimerPreset = {
      id: 'i1', name: 'Tabata', type: 'interval', sortOrder: 0, archived: false, createdAt: 0, updatedAt: 0,
      config: {
        prepSeconds: 10, sets: 8, cooldownSeconds: 30,
        intervals: [
          { label: 'Work', seconds: 20, kind: 'work', color: '#22c55e' },
          { label: 'Rest', seconds: 10, kind: 'rest', color: '#3b82f6' },
        ],
      },
    };
    const b = describeBlock(iv);
    expect(b.totalSeconds).toBe(10 + 8 * 30 + 30);
    expect(b.sets).toBe(8);
    expect(b.setLabel).toBe('20s');
    expect(b.detail).toEqual(['10s rest between', '30s cooldown at the end']);
  });

  it('builds proportional bar segments from the phases that actually run', () => {
    const b = describeBlock(pomo({ rounds: 2, work: 25, short: 5 }));
    // work, break, work — the 5s prep and the zero-length finish are not worth a stripe
    expect(b.segments.map((s) => s.kind)).toEqual(['work', 'rest', 'work']);
    expect(b.segments.map((s) => s.seconds)).toEqual([1500, 300, 1500]);
  });
});
