import { describe, expect, it } from 'vitest';
import { dailyProgress } from './dailyProgress';
import { startOfToday } from '../../lib/time';
import type { Habit, Session } from '../../lib/types';

const habit = (name: string, over: Partial<Habit> = {}): Habit => ({
  id: name, groupId: null, name, emoji: null, note: null, kind: 'time',
  durations: [20], defaultDurationMin: 20, dailyGoalMin: 20, weekendGoalMin: null,
  vacationGoalMin: null, sortOrder: 0, archived: false, hiddenOn: null, createdAt: 0,
  cadence: 'daily', anchor: null, targetCount: 1, template: null, ...over,
});

const log = (habitId: string, minutes: number): Session => {
  const endedAt = startOfToday() + 10 * 3600_000;
  return {
    id: Math.random().toString(36).slice(2), habitId, timerId: null, label: null,
    type: 'simple', plannedSeconds: minutes * 60, actualSeconds: minutes * 60, completed: true,
    startedAt: endedAt - minutes * 60_000, endedAt, note: null, createdAt: endedAt,
  };
};

describe('dailyProgress', () => {
  const habits = [
    habit('LeetCode', { dailyGoalMin: 20 }),
    habit('Portuguese', { dailyGoalMin: 15 }),
    habit('Read', { dailyGoalMin: 20 }),
    habit('Journaling', { dailyGoalMin: 25 }),
    habit('App P', { kind: 'abstain', dailyGoalMin: null }),
  ];

  it('totals the day goal so the header has something to compare against', () => {
    expect(dailyProgress(habits, [])).toEqual({ done: 0, total: 5, minutes: 0, goalMinutes: 80 });
  });

  it('counts a habit done once it reaches its goal', () => {
    const p = dailyProgress(habits, [log('LeetCode', 20), log('Read', 20)]);
    expect(p).toMatchObject({ done: 2, minutes: 40, goalMinutes: 80 });
  });

  it('counts partial minutes without counting the habit as done', () => {
    const p = dailyProgress(habits, [log('Journaling', 10)]);
    expect(p).toMatchObject({ done: 0, minutes: 10 });
  });

  it('caps a habit at its goal so overshoot cannot mask an untouched habit', () => {
    // 60 minutes of reading is not 75% of the day's work.
    const p = dailyProgress(habits, [log('Read', 60)]);
    expect(p).toMatchObject({ done: 1, minutes: 20, goalMinutes: 80 });
  });

  it('includes the abstinence check, which is a real daily obligation', () => {
    const p = dailyProgress(habits, [log('App P', 0)]);
    expect(p).toMatchObject({ done: 1, total: 5, minutes: 0 });
  });

  it('reaches a full house', () => {
    const p = dailyProgress(habits, [
      log('LeetCode', 20), log('Portuguese', 15), log('Read', 20), log('Journaling', 25), log('App P', 0),
    ]);
    expect(p).toEqual({ done: 5, total: 5, minutes: 80, goalMinutes: 80 });
  });

  it('excludes a goal-less time habit, which could never be counted done', () => {
    // isHabitDoneToday never completes one, so counting it would pin the
    // fraction below 100% no matter what you did.
    const p = dailyProgress([...habits, habit('Anki', { dailyGoalMin: null })], []);
    expect(p.total).toBe(5);
  });

  it('ignores archived habits and the weekly/monthly layers', () => {
    const p = dailyProgress([
      ...habits,
      habit('Old', { archived: true }),
      habit('Courage', { kind: 'check', cadence: 'weekly', anchor: 6 }),
    ], []);
    expect(p).toMatchObject({ total: 5, goalMinutes: 80 });
  });

  it('uses the lighter vacation goal when the day is a vacation day', () => {
    const light = [habit('Read', { dailyGoalMin: 20, vacationGoalMin: 5 })];
    const today = new Date(startOfToday());
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const p = dailyProgress(light, [log('Read', 5)], new Set([key]));
    expect(p).toEqual({ done: 1, total: 1, minutes: 5, goalMinutes: 5 });
  });
});
