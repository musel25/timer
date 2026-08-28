import { describe, expect, it } from 'vitest';
import {
  addPeriods, cadenceOf, isAnchorDay, isoWeekKey, isPeriodSatisfied, monthKey,
  occurrencesByPeriod, periodKey, periodStreak, targetOf,
} from './cadence';
import type { Habit, Session } from './types';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1', groupId: null, name: 'Nature', emoji: null, note: null,
    kind: 'check', durations: [30], defaultDurationMin: null, dailyGoalMin: null,
    weekendGoalMin: null, vacationGoalMin: null, sortOrder: 0, archived: false,
    hiddenOn: null, createdAt: 0, cadence: 'weekly', anchor: 6, targetCount: 1,
    template: null, ...over,
  };
}

function session(startedAt: number, over: Partial<Session> = {}): Session {
  return {
    id: Math.random().toString(36).slice(2), habitId: 'h1', timerId: null, label: null,
    type: 'simple', plannedSeconds: 0, actualSeconds: 0, completed: true,
    startedAt, endedAt: startedAt, note: null, createdAt: startedAt, ...over,
  };
}

describe('period keys', () => {
  it('keys a day, a week and a month from the same instant', () => {
    const ts = at(2026, 8, 28); // a Friday
    expect(periodKey('daily', ts)).toBe('2026-08-28');
    expect(periodKey('weekly', ts)).toBe('2026-W35');
    expect(periodKey('monthly', ts)).toBe('2026-08');
  });

  it('runs ISO weeks Monday–Sunday', () => {
    expect(isoWeekKey(at(2026, 8, 24))).toBe('2026-W35'); // Monday
    expect(isoWeekKey(at(2026, 8, 30))).toBe('2026-W35'); // Sunday, same week
    expect(isoWeekKey(at(2026, 8, 31))).toBe('2026-W36'); // next Monday
  });

  it('keeps a new-year week whole instead of splitting a streak', () => {
    // Thu 2026-12-31 and Fri 2027-01-01 are the same ISO week, numbered by the
    // year holding the Thursday.
    expect(isoWeekKey(at(2026, 12, 31))).toBe('2026-W53');
    expect(isoWeekKey(at(2027, 1, 1))).toBe('2026-W53');
    expect(isoWeekKey(at(2027, 1, 4))).toBe('2027-W01');
  });

  it('numbers early-January days belonging to the prior year', () => {
    expect(isoWeekKey(at(2027, 1, 3))).toBe('2026-W53'); // Sunday
    expect(monthKey(at(2027, 1, 3))).toBe('2027-01');
  });
});

describe('addPeriods', () => {
  it('steps days and weeks', () => {
    expect(periodKey('daily', addPeriods('daily', at(2026, 8, 28), -1))).toBe('2026-08-27');
    expect(periodKey('weekly', addPeriods('weekly', at(2026, 8, 28), -1))).toBe('2026-W34');
  });

  it('steps months without skipping February', () => {
    // Naive month arithmetic from the 31st lands on March 3rd; this must not.
    expect(monthKey(addPeriods('monthly', at(2026, 3, 31), -1))).toBe('2026-02');
    expect(monthKey(addPeriods('monthly', at(2026, 1, 15), -1))).toBe('2025-12');
  });
});

describe('occurrences and satisfaction', () => {
  it('counts one occurrence per completed session in the period', () => {
    const h = habit();
    const counts = occurrencesByPeriod(h, [session(at(2026, 8, 25)), session(at(2026, 8, 27))]);
    expect(counts['2026-W35']).toBe(2);
  });

  it('ignores sessions below a time habit per-occurrence floor', () => {
    const h = habit({ kind: 'time', dailyGoalMin: 30 });
    const counts = occurrencesByPeriod(h, [
      session(at(2026, 8, 25), { actualSeconds: 20 * 60 }), // short walk, does not count
      session(at(2026, 8, 27), { actualSeconds: 45 * 60 }),
    ]);
    expect(counts['2026-W35']).toBe(1);
  });

  it('ignores incomplete sessions and other habits', () => {
    const h = habit();
    const counts = occurrencesByPeriod(h, [
      session(at(2026, 8, 25), { completed: false }),
      session(at(2026, 8, 26), { habitId: 'other' }),
    ]);
    expect(counts['2026-W35']).toBeUndefined();
  });

  it('needs targetCount occurrences to satisfy a period', () => {
    const music = habit({ targetCount: 2 });
    expect(isPeriodSatisfied(music, [session(at(2026, 8, 25))], at(2026, 8, 28))).toBe(false);
    expect(isPeriodSatisfied(music, [session(at(2026, 8, 25)), session(at(2026, 8, 26))], at(2026, 8, 28))).toBe(true);
  });
});

describe('periodStreak', () => {
  const weeksBack = (n: number) => at(2026, 8, 28) - n * 7 * 24 * 3600_000;

  it('counts consecutive satisfied weeks', () => {
    const logs = [session(weeksBack(0)), session(weeksBack(1)), session(weeksBack(2))];
    expect(periodStreak(habit(), logs, at(2026, 8, 28))).toBe(3);
  });

  it('does not break on an open current week', () => {
    // Nothing logged this week yet, but the three before it were all met.
    const logs = [session(weeksBack(1)), session(weeksBack(2)), session(weeksBack(3))];
    expect(periodStreak(habit(), logs, at(2026, 8, 28))).toBe(3);
  });

  it('breaks on a genuinely missed week', () => {
    const logs = [session(weeksBack(1)), session(weeksBack(3))];
    expect(periodStreak(habit(), logs, at(2026, 8, 28))).toBe(1);
  });

  it('returns 0 with nothing logged', () => {
    expect(periodStreak(habit(), [], at(2026, 8, 28))).toBe(0);
  });

  it('requires the full target every week', () => {
    const music = habit({ targetCount: 2 });
    const logs = [
      session(weeksBack(1)), session(weeksBack(1) + 3600_000), // two: week met
      session(weeksBack(2)),                                    // one: week missed
    ];
    expect(periodStreak(music, logs, at(2026, 8, 28))).toBe(1);
  });

  it('counts months for a monthly habit', () => {
    const review = habit({ cadence: 'monthly', anchor: 1 });
    const logs = [session(at(2026, 8, 2)), session(at(2026, 7, 5)), session(at(2026, 6, 9))];
    expect(periodStreak(review, logs, at(2026, 8, 28))).toBe(3);
  });
});

describe('anchors', () => {
  it('surfaces a weekly habit on its weekday only', () => {
    const nature = habit({ anchor: 6 }); // Saturday
    expect(isAnchorDay(nature, at(2026, 8, 29))).toBe(true);
    expect(isAnchorDay(nature, at(2026, 8, 26))).toBe(false);
  });

  it('surfaces a monthly habit on its day of month', () => {
    const review = habit({ cadence: 'monthly', anchor: 28 });
    expect(isAnchorDay(review, at(2026, 8, 28))).toBe(true);
    expect(isAnchorDay(review, at(2026, 8, 27))).toBe(false);
  });

  it('always surfaces a daily habit', () => {
    expect(isAnchorDay(habit({ cadence: 'daily', anchor: null }), at(2026, 8, 27))).toBe(true);
  });
});

describe('stale service-worker rows', () => {
  // A response cached before these columns existed must not break the UI.
  it('reads a habit with no cadence fields as a single daily occurrence', () => {
    const legacy = { ...habit(), cadence: undefined, targetCount: undefined } as Habit;
    expect(cadenceOf(legacy)).toBe('daily');
    expect(targetOf(legacy)).toBe(1);
    expect(periodKey(cadenceOf(legacy), at(2026, 8, 28))).toBe('2026-08-28');
  });
});
