import { describe, expect, it } from 'vitest';
import { adherenceDays } from './adherence';
import { addDays, dayKey, startOfToday } from './time';
import type { Habit, Session } from './types';

const habit = (name: string, over: Partial<Habit> = {}): Habit => ({
  id: name, groupId: null, name, emoji: null, note: null, kind: 'time',
  durations: [20], defaultDurationMin: 20, dailyGoalMin: 20, weekendGoalMin: null,
  vacationGoalMin: null, sortOrder: 0, archived: false, hiddenOn: null, createdAt: 0,
  cadence: 'daily', anchor: null, targetCount: 1, template: null, ...over,
});

/** A completed session for `habitId`, `daysAgo` days back, at 10:00 local. */
const log = (habitId: string, minutes: number, daysAgo = 0): Session => {
  const endedAt = addDays(startOfToday(), -daysAgo) + 10 * 3600_000;
  return {
    id: Math.random().toString(36).slice(2), habitId, timerId: null, label: null,
    type: 'simple', plannedSeconds: minutes * 60, actualSeconds: minutes * 60, completed: true,
    startedAt: endedAt - minutes * 60_000, endedAt, note: null, createdAt: endedAt,
  };
};

const key = (daysAgo: number) => dayKey(addDays(startOfToday(), -daysAgo));

describe('adherenceDays', () => {
  const habits = [habit('Read', { dailyGoalMin: 20 }), habit('App', { kind: 'abstain', dailyGoalMin: null })];

  it('returns one row per day, oldest first, ending today', () => {
    const rows = adherenceDays(habits, [], 7);
    expect(rows).toHaveLength(7);
    expect(rows[0].date).toBe(key(6));
    expect(rows[6].date).toBe(key(0));
  });

  it('counts a time habit done on the day its minutes reach the goal', () => {
    const rows = adherenceDays(habits, [log('Read', 20, 2)], 7);
    expect(rows.find((r) => r.date === key(2))).toMatchObject({ done: 1, total: 2 });
    expect(rows.find((r) => r.date === key(1))).toMatchObject({ done: 0, total: 2 });
  });

  it('does not count a short day as done', () => {
    const rows = adherenceDays(habits, [log('Read', 10, 0)], 7);
    expect(rows[6]).toMatchObject({ done: 0, total: 2 });
  });

  it('counts an abstinence check on the day it was marked', () => {
    const rows = adherenceDays(habits, [log('App', 0, 3)], 7);
    expect(rows.find((r) => r.date === key(3))).toMatchObject({ done: 1, total: 2 });
  });

  it('leaves a rest day out of the count entirely', () => {
    const rows = adherenceDays(habits, [], 7, new Set([key(4)]));
    const rest = rows.find((r) => r.date === key(4))!;
    expect(rest).toMatchObject({ done: 0, total: 0, rest: true });
    expect(rows.filter((r) => r.rest)).toHaveLength(1);
  });

  it('ignores a time habit with no goal for that day — it can never be completed', () => {
    const rows = adherenceDays([habit('Guitar', { kind: 'time', dailyGoalMin: null })], [], 3);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });

  it('honours a vacation day that lightens the goal', () => {
    const h = habit('Read', { dailyGoalMin: 30, vacationGoalMin: 10 });
    const rows = adherenceDays([h], [log('Read', 10, 1)], 3, new Set(), new Set([key(1)]));
    expect(rows.find((r) => r.date === key(1))).toMatchObject({ done: 1, total: 1 });
  });

  it('drops a habit from days before it existed, so a new habit cannot dent the past', () => {
    const h = habit('Read', { createdAt: addDays(startOfToday(), -1) });
    const rows = adherenceDays([h], [], 5);
    expect(rows.map((r) => r.total)).toEqual([0, 0, 0, 1, 1]);
  });

  it('skips archived habits and non-daily cadences', () => {
    const rows = adherenceDays(
      [habit('Old', { archived: true }), habit('Review', { cadence: 'weekly' })],
      [], 3,
    );
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });

  it('ignores the legacy focus umbrella so its minutes cannot complete a habit', () => {
    const s = { ...log('Read', 20, 0), category: 'focus' as const };
    const rows = adherenceDays(habits, [s], 3);
    expect(rows[2]).toMatchObject({ done: 0 });
  });
});
