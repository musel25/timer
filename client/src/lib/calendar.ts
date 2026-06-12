import type { CalendarEvent } from './types';
import { dayKey } from './time';
import { addDaysKey } from './date';

/** Bucket events by local day key. All-day events span [start, end) — Google's
 *  all-day `end` date is exclusive. Timed events land on their local start day. */
export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const push = (k: string, e: CalendarEvent) => {
    const arr = map.get(k) ?? [];
    arr.push(e);
    map.set(k, arr);
  };
  for (const e of events) {
    if (e.allDay) {
      for (let k = e.start; k < e.end; k = addDaysKey(k, 1)) push(k, e);
    } else {
      push(dayKey(new Date(e.start).getTime()), e);
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.localeCompare(b.start));
  }
  return map;
}

/** "9:00 AM" for timed events, null for all-day. */
export function eventTimeLabel(e: CalendarEvent): string | null {
  if (e.allDay) return null;
  return new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
