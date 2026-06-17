import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentStreak, focusMinutes, goalStreak, minutesByDay, minutesInRange, todaySummary, todaysHabitSession } from './stats';
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

describe('focus-umbrella exclusion from time totals', () => {
  const noon = startOfToday() + 12 * 3600_000;
  // A 60-min focus block containing two 20-min habit runs. Counting the umbrella
  // would inflate "time spent" to 100 min for a 60-min wall-clock block.
  const sessions = [
    session(noon, { category: 'focus', actualSeconds: 3600, habitId: null }),
    session(noon, { habitId: 'h1', actualSeconds: 1200, parentSessionId: 'focus1' }),
    session(noon, { habitId: 'h2', actualSeconds: 1200, parentSessionId: 'focus1' }),
  ];

  it('todaySummary counts habit minutes only, not the umbrella', () => {
    const t = todaySummary(sessions);
    expect(t.minutes).toBe(40); // 20 + 20, focus excluded
    expect(t.count).toBe(2);
    expect(t.minutesByHabit).toEqual({ h1: 20, h2: 20 });
  });

  it('minutesByDay excludes the focus umbrella', () => {
    const k = Object.keys(minutesByDay(sessions))[0];
    expect(minutesByDay(sessions)[k]).toBe(40);
  });

  it('minutesInRange excludes the focus umbrella', () => {
    expect(minutesInRange(sessions, addDays(noon, -1), noon + 3600_000)).toBe(40);
  });

  it('focusMinutes still surfaces the focus block as focus time', () => {
    expect(focusMinutes(sessions, addDays(noon, -1))).toBe(60);
  });
});

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
  it('aggregates completed sessions into minutes per habit', () => {
    const noon = startOfToday() + 12 * 3600_000;
    const s = [
      session(noon, { habitId: 'h1', plannedSeconds: 600, actualSeconds: 600 }),
      session(noon + 3600_000, { habitId: 'h1', plannedSeconds: 600, actualSeconds: 600 }),
      session(noon + 7200_000, { habitId: 'h2', plannedSeconds: 1500, actualSeconds: 1500 }), // 25-min session
      session(addDays(noon, -1), { habitId: 'h1' }), // yesterday — excluded
    ];
    const t = todaySummary(s);
    expect(t.count).toBe(3);
    expect(t.minutes).toBe(45);
    expect(t.doneHabitIds.has('h1')).toBe(true);
    expect(t.minutesByHabit['h1']).toBe(20);
    expect(t.minutesByHabit['h2']).toBe(25);
  });
});

describe('todaysHabitSession', () => {
  const noon = startOfToday() + 12 * 3600_000;

  it("returns today's completed session for the habit (for un-marking)", () => {
    const mark = session(noon, { id: 'today', habitId: 'h1', actualSeconds: 0 });
    const s = [mark, session(addDays(noon, -1), { habitId: 'h1' })];
    expect(todaysHabitSession(s, 'h1')?.id).toBe('today');
  });

  it('returns null when nothing was logged today for the habit', () => {
    expect(todaysHabitSession([session(addDays(noon, -1), { habitId: 'h1' })], 'h1')).toBeNull();
    expect(todaysHabitSession([session(noon, { habitId: 'h2' })], 'h1')).toBeNull();
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
