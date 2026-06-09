import { describe, expect, it } from 'vitest';
import { dateToKey, keyToDate, addDaysKey, weekDays, monthMatrix, monthLabel, isSameMonth } from './date';

describe('date keys', () => {
  it('round-trips a key through a Date at local midnight', () => {
    const key = '2026-06-09';
    expect(dateToKey(keyToDate(key))).toBe(key);
    expect(keyToDate(key).getHours()).toBe(0);
  });

  it('formats a Date as a zero-padded local key', () => {
    expect(dateToKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('adds days across a month boundary', () => {
    expect(addDaysKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weekDays returns 7 keys starting on the configured week start (Mon=1)', () => {
    const days = weekDays('2026-06-10', 1); // Wed June 10 2026
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-06-08'); // Monday
    expect(days[6]).toBe('2026-06-14'); // Sunday
    expect(days).toContain('2026-06-10');
  });

  it('weekDays respects Sunday start (weekStart=0)', () => {
    const days = weekDays('2026-06-10', 0);
    expect(days[0]).toBe('2026-06-07'); // Sunday
    expect(days[6]).toBe('2026-06-13'); // Saturday
  });

  it('monthMatrix returns whole weeks covering the month, week-start aligned', () => {
    const m = monthMatrix(2026, 5, 1); // June 2026 (month index 5), Monday start
    expect(m[0]).toHaveLength(7);
    expect(m.flat()).toContain('2026-06-01');
    expect(m.flat()).toContain('2026-06-30');
    expect(m[0][0].endsWith('-06-01') || m[0][0] < '2026-06-01').toBe(true); // first cell is on/before the 1st
    expect(m.flat().length % 7).toBe(0);
  });

  it('isSameMonth distinguishes leading/trailing days', () => {
    expect(isSameMonth('2026-06-30', 2026, 5)).toBe(true);
    expect(isSameMonth('2026-07-01', 2026, 5)).toBe(false);
  });

  it('monthLabel renders a human month + year', () => {
    expect(monthLabel(2026, 5)).toBe('June 2026');
  });
});
