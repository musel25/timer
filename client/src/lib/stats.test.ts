import { describe, expect, it } from 'vitest';
import { currentStreak, focusMinutes, goalBlocks, goalStreak, todaySummary } from './stats';
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
  it('aggregates completed sessions and counts 10-min blocks', () => {
    const noon = startOfToday() + 12 * 3600_000;
    const s = [
      session(noon, { habitId: 'h1', plannedSeconds: 600, actualSeconds: 600 }),
      session(noon + 3600_000, { habitId: 'h1', plannedSeconds: 600, actualSeconds: 600 }),
      session(noon + 7200_000, { habitId: 'h2', plannedSeconds: 1500, actualSeconds: 1500 }), // legacy 25-min session
      session(addDays(noon, -1), { habitId: 'h1' }), // yesterday — excluded
    ];
    const t = todaySummary(s);
    expect(t.count).toBe(3);
    expect(t.minutes).toBe(45);
    expect(t.doneHabitIds.has('h1')).toBe(true);
    expect(t.blocksByHabit['h1']).toBe(2);
    expect(t.blocksByHabit['h2']).toBe(2); // floor(25 / 10)
  });
});

describe('goalBlocks', () => {
  it('converts goal minutes to blocks', () => {
    expect(goalBlocks(30)).toBe(3);
    expect(goalBlocks(25)).toBe(3); // rounds
    expect(goalBlocks(5)).toBe(1); // at least one block when a goal exists
    expect(goalBlocks(null)).toBeNull();
    expect(goalBlocks(0)).toBeNull();
  });
});

describe('goalStreak', () => {
  const noon = startOfToday() + 12 * 3600_000;

  it('counts consecutive days the goal was met', () => {
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 1200 }), // 2 blocks today
      session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 1200 }),
      session(addDays(noon, -2), { habitId: 'h1', actualSeconds: 600 }), // only 1 block — goal missed
    ];
    expect(goalStreak(s, 'h1', 20)).toBe(2);
  });

  it('does not break the streak when today is not yet met', () => {
    const s = [session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 1200 })];
    expect(goalStreak(s, 'h1', 20)).toBe(1);
  });

  it('requires at least one block per day when there is no goal', () => {
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 600 }),
      session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 300 }), // half a block — breaks
    ];
    expect(goalStreak(s, 'h1', null)).toBe(1);
  });

  it('ignores other habits and incomplete sessions', () => {
    const s = [
      session(noon, { habitId: 'h2', actualSeconds: 1200 }),
      session(noon, { habitId: 'h1', actualSeconds: 1200, completed: false }),
    ];
    expect(goalStreak(s, 'h1', 10)).toBe(0);
  });
});

describe('focusMinutes', () => {
  const noon = startOfToday() + 12 * 3600_000;

  it('sums habit-less sessions in range', () => {
    const s = [
      session(noon, { actualSeconds: 1500 }),
      session(noon, { actualSeconds: 600 }),
      session(noon, { habitId: 'h1', actualSeconds: 600 }), // habit session — excluded
      session(addDays(noon, -10), { actualSeconds: 600 }), // out of range
    ];
    expect(Math.round(focusMinutes(s, startOfToday()))).toBe(35);
  });
});
