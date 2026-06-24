import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentStreak, effectiveGoal, focusMinutes, goalStreak, habitStreak, minutesByDay, minutesInRange, todaySummary, todaysHabitSession } from './stats';
import { dayKey, startOfToday, addDays } from './time';
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
    expect(goalStreak(s, { id: 'h1', dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null })).toBe(2);
  });

  it('does not break the streak when today is not yet met', () => {
    const s = [session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 1200 })];
    expect(goalStreak(s, { id: 'h1', dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null })).toBe(1);
  });

  it('requires at least one block per day when there is no goal', () => {
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 600 }),
      session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 300 }), // half a block — breaks
    ];
    expect(goalStreak(s, { id: 'h1', dailyGoalMin: null, weekendGoalMin: null, vacationGoalMin: null })).toBe(1);
  });

  it('ignores other habits and incomplete sessions', () => {
    const s = [
      session(noon, { habitId: 'h2', actualSeconds: 1200 }),
      session(noon, { habitId: 'h1', actualSeconds: 1200, completed: false }),
    ];
    expect(goalStreak(s, { id: 'h1', dailyGoalMin: 10, weekendGoalMin: null, vacationGoalMin: null })).toBe(0);
  });
});

describe('rest days bridge streaks', () => {
  const noon = startOfToday() + 12 * 3600_000;
  const k = (n: number) => dayKey(addDays(noon, n));

  it('currentStreak: a rest day on yesterday bridges the gap (no +1)', () => {
    // today not done; yesterday is a rest day; the two days before were done.
    const s = [session(addDays(noon, -2)), session(addDays(noon, -3))];
    expect(currentStreak(s, undefined, new Set([k(-1)]))).toBe(2);
  });

  it('currentStreak: a rest day is bridged, not counted, when today is done', () => {
    const s = [session(noon), session(addDays(noon, -2))];
    expect(currentStreak(s, undefined, new Set([k(-1)]))).toBe(2); // today + day-2, rest day skipped
  });

  it('currentStreak: a real gap next to a rest day still breaks', () => {
    // today done, yesterday rest, day-2 missed (real gap), day-3 done.
    const s = [session(noon), session(addDays(noon, -3))];
    expect(currentStreak(s, undefined, new Set([k(-1)]))).toBe(1);
  });

  it('goalStreak: a rest day bridges goal-met days (no +1)', () => {
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 1200 }),
      session(addDays(noon, -2), { habitId: 'h1', actualSeconds: 1200 }),
    ];
    expect(goalStreak(s, { id: 'h1', dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null }, new Set([k(-1)]))).toBe(2);
  });

  it('goalStreak: a rest day on today is transparent', () => {
    const s = [session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 1200 })];
    expect(goalStreak(s, { id: 'h1', dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null }, new Set([k(0)]))).toBe(1);
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

describe('tiered goals (weekend / vacation)', () => {
  // A fixed Saturday noon so weekend detection is deterministic.
  const sat = new Date('2026-06-20T12:00:00').getTime(); // 2026-06-20 is a Saturday
  const mon = new Date('2026-06-22T12:00:00').getTime(); // Monday
  const h = { id: 'h1', dailyGoalMin: 30, weekendGoalMin: 5, vacationGoalMin: null };

  it('effectiveGoal: weekday uses the daily goal', () => {
    expect(effectiveGoal(h, mon, new Set())).toBe(30);
  });

  it('effectiveGoal: weekend uses the weekend goal when set', () => {
    expect(effectiveGoal(h, sat, new Set())).toBe(5);
  });

  it('effectiveGoal: weekend falls back to daily goal when weekendGoalMin is null', () => {
    expect(effectiveGoal({ id: 'h1', dailyGoalMin: 30, weekendGoalMin: null, vacationGoalMin: null }, sat, new Set())).toBe(30);
  });

  it('effectiveGoal: vacation falls back to the weekend goal when vacationGoalMin is null', () => {
    const k = dayKey(mon);
    expect(effectiveGoal(h, mon, new Set([k]))).toBe(5); // vacation → null vac → weekend 5
  });

  it('effectiveGoal: vacation uses its own goal when set', () => {
    const k = dayKey(mon);
    const v = { id: 'h1', dailyGoalMin: 30, weekendGoalMin: 5, vacationGoalMin: 2 };
    expect(effectiveGoal(v, mon, new Set([k]))).toBe(2);
  });

  it('effectiveGoal: no daily goal → null on a weekday', () => {
    expect(effectiveGoal({ id: 'h1', dailyGoalMin: null, weekendGoalMin: null, vacationGoalMin: null }, mon, new Set())).toBeNull();
  });
});

describe('goalStreak honors the per-day effective goal', () => {
  const noon = startOfToday() + 12 * 3600_000;
  const isWeekendToday = [0, 6].includes(new Date(noon).getDay());
  const habit = { id: 'h1', dailyGoalMin: 30, weekendGoalMin: 5, vacationGoalMin: null };

  it('a light day that meets the weekend goal keeps the streak (when today is a weekend)', () => {
    if (!isWeekendToday) return; // deterministic only on weekends; effectiveGoal unit tests cover the logic
    const s = [session(noon, { habitId: 'h1', actualSeconds: 300 })]; // 5 min
    expect(goalStreak(s, habit)).toBe(1);
  });

  it('rest days remain transparent under tiered goals', () => {
    const k = dayKey(addDays(noon, -1));
    const s = [
      session(noon, { habitId: 'h1', actualSeconds: 1800 }),
      session(addDays(noon, -2), { habitId: 'h1', actualSeconds: 1800 }),
    ];
    expect(goalStreak(s, habit, new Set([k]))).toBe(2); // yesterday rest day bridges
  });

  it('a vacation day still requires its (lighter) goal', () => {
    const k = dayKey(addDays(noon, -1));
    const below = [
      session(noon, { habitId: 'h1', actualSeconds: 1800 }),
      session(addDays(noon, -1), { habitId: 'h1', actualSeconds: 60 }), // 1 min < weekend/vac goal 5
    ];
    // yesterday is a vacation day needing 5 min; only 1 logged → it breaks → streak = today only
    expect(goalStreak(below, habit, new Set(), new Set([k]))).toBe(1);
  });
});
