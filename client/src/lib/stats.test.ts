import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('goalStreak with weekdaysOnly', () => {
  afterEach(() => vi.useRealTimers());

  // Local-noon timestamp for a calendar date.
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
  const h = (ts: number) => session(ts, { habitId: 'h1' }); // 600s = 1 block, meets the no-goal need of 1

  it('bridges the weekend: Friday met + Monday met = streak of 2', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 8, 12)); // Monday 2026-06-08
    const s = [h(at(2026, 6, 8)), h(at(2026, 6, 5))]; // Mon + previous Fri
    expect(goalStreak(s, 'h1', null, true)).toBe(2);
    expect(goalStreak(s, 'h1', null, false)).toBe(1); // sanity: weekend gap still breaks the normal streak
  });

  it('ignores weekend sessions entirely (no break, no bonus)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 8, 12)); // Monday
    // Monday met, Saturday session logged, Friday NOT met → streak is just Monday.
    const s = [h(at(2026, 6, 8)), h(at(2026, 6, 6))];
    expect(goalStreak(s, 'h1', null, true)).toBe(1);
  });

  it('still breaks on a missed weekday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12)); // Wednesday 2026-06-10
    // Wed met, Tue missed, Mon met → only Wednesday counts.
    const s = [h(at(2026, 6, 10)), h(at(2026, 6, 8))];
    expect(goalStreak(s, 'h1', null, true)).toBe(1);
  });

  it('grants the not-yet-met-today grace across a weekend (Monday morning sees Friday)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 8, 12)); // Monday, nothing logged yet today
    const s = [h(at(2026, 6, 5)), h(at(2026, 6, 4))]; // Fri + Thu
    expect(goalStreak(s, 'h1', null, true)).toBe(2);
  });

  it('anchors on Friday when today is a weekend day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 13, 12)); // Saturday 2026-06-13
    const s = [h(at(2026, 6, 12)), h(at(2026, 6, 11))]; // Fri + Thu
    expect(goalStreak(s, 'h1', null, true)).toBe(2);
  });

  it('does not count a weekend session even when today is that weekend day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 14, 12)); // Sunday 2026-06-14
    // Sessions only on Sun + Sat; Friday was missed → anchor must skip to Friday and find nothing.
    const s = [h(at(2026, 6, 14)), h(at(2026, 6, 13))];
    expect(goalStreak(s, 'h1', null, true)).toBe(0);
  });
});
