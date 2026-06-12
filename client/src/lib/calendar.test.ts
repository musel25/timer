import { describe, expect, it } from 'vitest';
import { eventsByDay } from './calendar';
import type { CalendarEvent } from './types';

const ev = (o: Partial<CalendarEvent>): CalendarEvent => ({
  id: Math.random().toString(36).slice(2),
  calendarId: 'c',
  title: 'x',
  start: '2026-06-08',
  end: '2026-06-09',
  allDay: true,
  ...o,
});

describe('eventsByDay', () => {
  it('buckets a timed event on its local start day', () => {
    // Local-time ISO string (no Z) so the test is timezone-independent.
    const m = eventsByDay([ev({ allDay: false, start: '2026-06-08T09:00:00', end: '2026-06-08T09:30:00' })]);
    expect(m.get('2026-06-08')?.length).toBe(1);
  });

  it('spans a multi-day all-day event across [start, end)', () => {
    const m = eventsByDay([ev({ start: '2026-06-08', end: '2026-06-10' })]);
    expect(m.get('2026-06-08')?.length).toBe(1);
    expect(m.get('2026-06-09')?.length).toBe(1);
    expect(m.get('2026-06-10')).toBeUndefined(); // end is exclusive
  });

  it('sorts all-day events before timed ones, then by start', () => {
    const m = eventsByDay([
      ev({ id: 'late', allDay: false, start: '2026-06-08T15:00:00', end: '2026-06-08T16:00:00' }),
      ev({ id: 'early', allDay: false, start: '2026-06-08T08:00:00', end: '2026-06-08T09:00:00' }),
      ev({ id: 'allday', start: '2026-06-08', end: '2026-06-09' }),
    ]);
    expect(m.get('2026-06-08')!.map((e) => e.id)).toEqual(['allday', 'early', 'late']);
  });
});
