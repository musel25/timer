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
  it('leads with the whole span, so "how long does this block last" is answered first', () => {
    const b = describeBlock(pomo({ rounds: 4, work: 25, short: 5 }));
    // 4 × 25m work + 3 × 5m breaks + the 5s prep
    expect(b.totalSeconds).toBe(4 * 25 * 60 + 3 * 5 * 60 + 5);
    expect(b.focusSeconds).toBe(4 * 25 * 60);
  });

  it('spells the sets out in words — "× 4" alone never said how long a set was', () => {
    const b = describeBlock(pomo({ rounds: 4, work: 25, short: 5 }));
    expect(b.lines).toEqual(['4 focus sets of 25 min', '5 min break between']);
  });

  it('drops the break line when there is only one set to break between', () => {
    expect(describeBlock(pomo({ rounds: 1 })).lines).toEqual(['1 focus set of 25 min']);
  });

  it('names the long break only when one actually falls inside the block', () => {
    expect(describeBlock(pomo({ rounds: 4, longEvery: 4 })).lines).not.toContain('20 min long break every 4');
    expect(describeBlock(pomo({ rounds: 6, longEvery: 3, long: 20 })).lines).toContain('20 min long break every 3');
  });

  it('describes a plain timer as its own single stretch', () => {
    const simple: TimerPreset = {
      id: 's1', name: '10 min', type: 'simple', sortOrder: 0, archived: false, createdAt: 0, updatedAt: 0,
      config: { totalSeconds: 600, prepSeconds: 0 },
    };
    const b = describeBlock(simple);
    expect(b.totalSeconds).toBe(600);
    expect(b.lines).toEqual(['One 10 min stretch']);
  });

  it('describes an interval preset by its work/rest pair and set count', () => {
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
    expect(b.lines).toEqual(['8 sets of 20s work / 10s rest', '30s cooldown at the end']);
  });

  it('builds proportional bar segments from the phases that actually run', () => {
    const b = describeBlock(pomo({ rounds: 2, work: 25, short: 5 }));
    // work, break, work — the 5s prep and the zero-length finish are not worth a stripe
    expect(b.segments.map((s) => s.kind)).toEqual(['work', 'rest', 'work']);
    expect(b.segments.map((s) => s.seconds)).toEqual([1500, 300, 1500]);
  });
});
