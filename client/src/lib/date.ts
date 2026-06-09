/** Local-calendar date helpers keyed as 'YYYY-MM-DD' (no timezone drift). */

const pad = (n: number) => String(n).padStart(2, '0');

/** Format a Date as a local 'YYYY-MM-DD' key. */
export function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a 'YYYY-MM-DD' key into a Date at local midnight. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today's local key. */
export function todayKey(): string {
  return dateToKey(new Date());
}

/** Shift a key by n days (n may be negative). */
export function addDaysKey(key: string, n: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dateToKey(d);
}

/** The 7 day-keys of the week containing `key`, ordered from `weekStart` (0=Sun,1=Mon). */
export function weekDays(key: string, weekStart: number): string[] {
  const d = keyToDate(key);
  const offset = (d.getDay() - weekStart + 7) % 7;
  const start = addDaysKey(key, -offset);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/** True if `key` falls in the given year/month (month is 0-based). */
export function isSameMonth(key: string, year: number, month0: number): boolean {
  const d = keyToDate(key);
  return d.getFullYear() === year && d.getMonth() === month0;
}

/** A matrix of whole weeks (each 7 keys) covering the month, week-start aligned.
 *  'YYYY-MM-DD' strings compare lexicographically === chronologically, so the
 *  string `<=` comparisons below are correct. */
export function monthMatrix(year: number, month0: number, weekStart: number): string[][] {
  const firstKey = dateToKey(new Date(year, month0, 1));
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const lastKey = dateToKey(new Date(year, month0, lastDay));
  let cursor = weekDays(firstKey, weekStart)[0];
  const weeks: string[][] = [];
  while (cursor <= lastKey) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysKey(cursor, i)));
    cursor = addDaysKey(cursor, 7);
  }
  return weeks;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "June 2026" for year/month0. */
export function monthLabel(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`;
}
