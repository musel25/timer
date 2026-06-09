import { describe, expect, it } from 'vitest';
import { currentStreak, todaySummary } from './stats';
import { startOfToday, addDays } from './time';
import type { Session } from './types';

function session(startedAt: number, opts: Partial<Session> = {}): Session {
  return {
    id: Math.random().toString(36).slice(2),
    habitId: null,
    timerId: null,
    label: null,
    type: 'simple',
    plannedSeconds: 600,
    actualSeconds: 600,
    completed: true,
    startedAt,
    endedAt: startedAt + 600000,
    note: null,
    createdAt: startedAt,
    ...opts,
  };
}

describe('currentStreak', () => {
  const noon = startOfToday() + 12 * 3600_000;

  it('counts consecutive days ending today', () => {
    const s = [session(noon), session(addDays(noon, -1)), session(addDays(noon, -2))];
    expect(currentStreak(s)).toBe(3);
  });

  it('breaks on a gap', () => {
    const s = [session(noon), session(addDays(noon, -2))];
    expect(currentStreak(s)).toBe(1);
  });

  it('is 0 when the most recent activity is older than yesterday', () => {
    expect(currentStreak([session(addDays(noon, -3))])).toBe(0);
  });

  it('ignores incomplete sessions', () => {
    expect(currentStreak([session(noon, { completed: false })])).toBe(0);
  });
});

describe('todaySummary', () => {
  it('aggregates completed sessions and marks done chips', () => {
    const noon = startOfToday() + 12 * 3600_000;
    const s = [
      session(noon, { habitId: 'h1', plannedSeconds: 600, actualSeconds: 600 }),
      session(addDays(noon, -1), { habitId: 'h1' }), // yesterday — excluded
    ];
    const t = todaySummary(s);
    expect(t.count).toBe(1);
    expect(t.minutes).toBe(10);
    expect(t.doneHabitIds.has('h1')).toBe(true);
    expect(t.doneChips.has('h1:10')).toBe(true);
  });
});
