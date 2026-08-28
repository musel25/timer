import { describe, expect, it } from 'vitest';
import { cadenceRows, ordinal } from './cadenceRows';
import type { Habit, Session } from '../../lib/types';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

const habit = (name: string, over: Partial<Habit> = {}): Habit => ({
  id: name, groupId: null, name, emoji: null, note: null, kind: 'check',
  durations: [20], defaultDurationMin: null, dailyGoalMin: null, weekendGoalMin: null,
  vacationGoalMin: null, sortOrder: 0, archived: false, hiddenOn: null, createdAt: 0,
  cadence: 'weekly', anchor: 1, targetCount: 1, template: null, ...over,
});

const session = (habitId: string, startedAt: number): Session => ({
  id: Math.random().toString(36).slice(2), habitId, timerId: null, label: null,
  type: 'simple', plannedSeconds: 0, actualSeconds: 0, completed: true,
  startedAt, endedAt: startedAt, note: null, createdAt: startedAt,
});

describe('ordinal', () => {
  it('names days of the month', () => {
    expect([1, 2, 3, 4, 7, 21, 22, 23, 28].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '7th', '21st', '22nd', '23rd', '28th'],
    );
  });

  it('handles the teens, which are all "th"', () => {
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th']);
  });
});

describe('cadenceRows — weekly', () => {
  const week = [
    habit('Nature', { anchor: 6 }),
    habit('Weekly review', { anchor: 0 }),
    habit('Courage', { anchor: 3 }),
    habit('Music', { anchor: 2, targetCount: 2 }),
  ];
  const friday = at(2026, 8, 28);

  it('orders the week from Monday and labels each day', () => {
    expect(cadenceRows(week, [], 1, friday).map((r) => [r.label, r.habit.name])).toEqual([
      ['Tue', 'Music'],
      ['Wed', 'Courage'],
      ['Sat', 'Nature'],
      ['Sun', 'Weekly review'],
    ]);
  });

  it('rotates the order for a Sunday-start week', () => {
    expect(cadenceRows(week, [], 0, friday).map((r) => r.label)).toEqual(['Sun', 'Tue', 'Wed', 'Sat']);
  });

  it('marks the row whose anchor is today', () => {
    // Friday 2026-08-28: nothing here is anchored to Friday.
    expect(cadenceRows(week, [], 1, friday).some((r) => r.isToday)).toBe(false);
    // Saturday: Nature is up.
    const sat = cadenceRows(week, [], 1, at(2026, 8, 29));
    expect(sat.find((r) => r.isToday)?.habit.name).toBe('Nature');
  });

  it('counts progress toward a target above one', () => {
    const rows = cadenceRows(week, [session('Music', at(2026, 8, 25))], 1, friday);
    const music = rows.find((r) => r.habit.name === 'Music')!;
    expect(music).toMatchObject({ done: 1, target: 2, satisfied: false });
  });

  it('marks a habit satisfied when logged on any day of its week, not its anchor', () => {
    // Nature is anchored to Saturday but walked on Tuesday — the week is met.
    const rows = cadenceRows(week, [session('Nature', at(2026, 8, 25))], 1, friday);
    expect(rows.find((r) => r.habit.name === 'Nature')?.satisfied).toBe(true);
  });
});

describe('cadenceRows — monthly', () => {
  const month = [
    habit('Life review', { cadence: 'monthly', anchor: 28 }),
    habit('Simplify', { cadence: 'monthly', anchor: 7 }),
    habit('Beliefs & values', { cadence: 'monthly', anchor: 21 }),
  ];

  it('orders by day of month with ordinal labels', () => {
    expect(cadenceRows(month, [], 1, at(2026, 8, 28)).map((r) => r.label)).toEqual(['7th', '21st', '28th']);
  });

  it('marks the habit due on today date', () => {
    const rows = cadenceRows(month, [], 1, at(2026, 8, 28));
    expect(rows.find((r) => r.isToday)?.habit.name).toBe('Life review');
  });
});
