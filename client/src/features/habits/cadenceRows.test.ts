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

  it('says when the habit is due, then how long is left once its day has passed', () => {
    const on = (d: number) => Object.fromEntries(
      cadenceRows(week, [], 1, at(2026, 8, d)).map((r) => [r.habit.name, r.due]),
    );
    // Thursday 27th. Tuesday and Wednesday have gone, so those switch to the
    // real deadline — Sunday, when the ISO week ends.
    expect(on(27)).toEqual({
      Music: '3 days left',      // Tue, passed
      Courage: '3 days left',    // Wed, passed
      Nature: 'in 2 days',       // Sat
      'Weekly review': 'in 3 days', // Sun
    });
    // Sunday 30th: the last day of the ISO week.
    expect(on(30)['Nature']).toBe('last day');
  });

  it('stops nagging once the period is satisfied', () => {
    const rows = cadenceRows(week, [session('Nature', at(2026, 8, 25))], 1, at(2026, 8, 27));
    expect(rows.find((r) => r.habit.name === 'Nature')?.due).toBeNull();
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

  it('labels the real date, not a bare ordinal', () => {
    // "28th" leaves you working out the weekday yourself — the thing that made
    // monthly habits feel unschedulable. Asserted loosely because the exact
    // wording is the viewer's locale ("Mon 28 Sept" vs "Mon, Sep 28").
    const labels = cadenceRows(month, [], 1, at(2026, 9, 15)).map((r) => r.label);
    expect(labels.every((l) => /Mon/.test(l))).toBe(true); // Sep 2026: 7/21/28 are all Mondays
    expect(labels.map((l) => l.match(/\d+/)![0])).toEqual(['7', '21', '28']);
  });

  it('orders by day of month', () => {
    expect(cadenceRows(month, [], 1, at(2026, 8, 28)).map((r) => r.habit.name))
      .toEqual(['Simplify', 'Beliefs & values', 'Life review']);
  });

  it('marks the habit due on today date', () => {
    const rows = cadenceRows(month, [], 1, at(2026, 8, 28));
    expect(rows.find((r) => r.isToday)?.habit.name).toBe('Life review');
  });

  it('counts down to the anchor, then to the end of the month', () => {
    const on = (d: number) => Object.fromEntries(
      cadenceRows(month, [], 1, at(2026, 9, d)).map((r) => [r.habit.name, r.due]),
    );
    // Sep 15: the 7th has gone (30 - 15 = 15 days left in the month); the
    // others are still ahead.
    expect(on(15)).toEqual({ 'Simplify': '15 days left', 'Beliefs & values': 'in 6 days', 'Life review': 'in 13 days' });
    expect(on(30)['Life review']).toBe('last day'); // September has 30 days
  });
});
