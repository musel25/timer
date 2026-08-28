import type { Cadence, Habit, Session } from './types';
import { dayKey, addDays } from './time';

const WEEK_MS = 7 * 24 * 3600_000;

/** A habit's cadence, tolerating rows cached by the service worker before the
 *  column existed (see the `isArchived` precedent in features/notes). */
export const cadenceOf = (h: Pick<Habit, 'cadence'>): Cadence => h.cadence ?? 'daily';

/** Occurrences needed to satisfy one period. Absent/0 means one. */
export const targetOf = (h: Pick<Habit, 'targetCount'>): number => Math.max(1, h.targetCount ?? 1);

/** Local-time month key, e.g. "2026-08". */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Local-time ISO-8601 week key, e.g. "2026-W35". Weeks run Monday–Sunday and
 * belong to the year containing their Thursday, so the days either side of New
 * Year land in one unambiguous week rather than splitting a streak in half.
 */
export function isoWeekKey(ts: number): string {
  const thursdayOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // Mon=0 … Sun=6, then jump to Thursday
    return d;
  };
  const thu = thursdayOf(ts);
  const year = thu.getFullYear();
  const firstThu = thursdayOf(new Date(year, 0, 4).getTime()); // Jan 4 is always in ISO week 1
  // Rounded because a DST shift inside the span offsets it by an hour at most.
  const week = 1 + Math.round((thu.getTime() - firstThu.getTime()) / WEEK_MS);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The period a timestamp falls in: "2026-08-28" | "2026-W35" | "2026-08". */
export function periodKey(cadence: Cadence, ts: number): string {
  if (cadence === 'weekly') return isoWeekKey(ts);
  if (cadence === 'monthly') return monthKey(ts);
  return dayKey(ts);
}

/** Step `n` whole periods from `ts` (negative walks backwards). */
export function addPeriods(cadence: Cadence, ts: number, n: number): number {
  if (cadence === 'weekly') return addDays(ts, 7 * n);
  if (cadence === 'monthly') {
    const d = new Date(ts);
    d.setDate(1); // avoid Jan 31 → Mar 3 when stepping through a short month
    d.setMonth(d.getMonth() + n);
    return d.getTime();
  }
  return addDays(ts, n);
}

/**
 * How many times the habit was logged in each period, keyed by period key. One
 * occurrence is a completed session that clears the habit's per-occurrence
 * minute floor — `dailyGoalMin` for a 'time' habit (Music ≥ 20, Nature ≥ 30),
 * nothing at all for 'check' and 'abstain'.
 */
export function occurrencesByPeriod(habit: Habit, sessions: Session[]): Record<string, number> {
  const floor = habit.kind === 'time' && habit.dailyGoalMin && habit.dailyGoalMin > 0 ? habit.dailyGoalMin : 0;
  const cadence = cadenceOf(habit);
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.completed || s.habitId !== habit.id) continue;
    if (floor && s.actualSeconds / 60 < floor - 1e-9) continue;
    const k = periodKey(cadence, s.startedAt);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Whether the period containing `ts` has met the habit's target count. */
export function isPeriodSatisfied(habit: Habit, sessions: Session[], ts = Date.now()): boolean {
  const counts = occurrencesByPeriod(habit, sessions);
  return (counts[periodKey(cadenceOf(habit), ts)] ?? 0) >= targetOf(habit);
}

/**
 * Consecutive satisfied periods ending with the current one — or the previous
 * one when the current is still open. That grace mirrors {@link goalStreak}: a
 * week you have not got to yet must not read as a broken streak on Monday.
 */
export function periodStreak(habit: Habit, sessions: Session[], now = Date.now()): number {
  const cadence = cadenceOf(habit);
  const counts = occurrencesByPeriod(habit, sessions);
  const target = targetOf(habit);
  const met = (ts: number) => (counts[periodKey(cadence, ts)] ?? 0) >= target;

  let cursor = now;
  if (!met(cursor)) {
    cursor = addPeriods(cadence, cursor, -1);
    if (!met(cursor)) return 0;
  }
  let streak = 0;
  while (met(cursor)) {
    streak += 1;
    cursor = addPeriods(cadence, cursor, -1);
  }
  return streak;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** 1–4 pick an occurrence; 5 means the last one, however many the month has. */
export const WEEK_NAMES: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'last' };

/** "1st", "2nd", "3rd", "7th", "21st"… */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * The day of the month a monthly habit lands on, in the month containing `ts`.
 *
 * With `anchorWeek` set the anchor is a weekday and the habit falls on that
 * weekday's nth occurrence ("last Sunday") — a fixed day of the week rather than
 * a number that drifts across weekdays month to month. Week 5 resolves to the
 * last occurrence, so a four-Sunday month is not skipped.
 *
 * Without it the anchor keeps its older day-of-month reading, so a row written
 * before the column existed still surfaces on its number.
 */
export function monthlyAnchorDay(habit: Pick<Habit, 'anchor' | 'anchorWeek'>, ts = Date.now()): number {
  const anchor = habit.anchor ?? 1;
  const week = habit.anchorWeek;
  if (!week) return anchor;

  const d = new Date(ts);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (week >= 5) {
    const last = new Date(year, month + 1, 0);
    return last.getDate() - ((last.getDay() - anchor + 7) % 7);
  }
  const firstMatch = 1 + ((anchor - new Date(year, month, 1).getDay() + 7) % 7);
  return firstMatch + 7 * (week - 1); // at most 7 + 21 = 28, so always a real day
}

/**
 * Whether a weekly/monthly habit should surface in Today: its anchor lands on
 * this day and the period is still unsatisfied. Weekly anchors are weekdays
 * (0 = Sunday); monthly ones resolve through {@link monthlyAnchorDay}. An
 * anchorless habit surfaces on the period's first day so it never disappears.
 */
export function isAnchorDay(habit: Habit, ts = Date.now()): boolean {
  const cadence = cadenceOf(habit);
  const d = new Date(ts);
  if (cadence === 'weekly') return (habit.anchor ?? 1) === d.getDay();
  if (cadence === 'monthly') return monthlyAnchorDay(habit, ts) === d.getDate();
  return true;
}

/**
 * How often the habit comes round and on which day — "Weekly · Wednesdays",
 * "Monthly · last Sunday". Daily habits get null: their day is every day, and
 * saying so is noise. Shown wherever the habit is met away from the agenda,
 * which is otherwise the only place its day is stated.
 */
export function cadenceLabel(habit: Habit): string | null {
  const cadence = cadenceOf(habit);
  if (cadence === 'daily') return null;
  const target = targetOf(habit);

  const day = cadence === 'weekly'
    ? `${WEEKDAY_NAMES[(habit.anchor ?? 1) % 7]}s`
    : habit.anchorWeek
      ? `${WEEK_NAMES[habit.anchorWeek] ?? 'last'} ${WEEKDAY_NAMES[(habit.anchor ?? 0) % 7]}`
      : `the ${ordinal(habit.anchor ?? 1)}`;

  const every = cadence === 'weekly' ? 'week' : 'month';
  const times = target > 1 ? ` · ${target}× per ${every}` : '';
  return `${cadence === 'weekly' ? 'Weekly' : 'Monthly'} · ${day}${times}`;
}

/** One period in a habit's history. */
export interface PeriodCell {
  key: string;
  label: string;
  count: number;
  satisfied: boolean;
}

/**
 * The last `count` periods, oldest first — the weekly/monthly answer to the
 * daily activity grid, which has nothing to show when a habit only comes round
 * once a month.
 */
export function periodHistory(habit: Habit, sessions: Session[], count: number, now = Date.now()): PeriodCell[] {
  const cadence = cadenceOf(habit);
  const counts = occurrencesByPeriod(habit, sessions);
  const target = targetOf(habit);
  const label = (ts: number) => {
    const d = new Date(ts);
    if (cadence === 'monthly') return d.toLocaleDateString(undefined, { month: 'short' });
    if (cadence === 'weekly') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { day: 'numeric' });
  };
  const out: PeriodCell[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ts = addPeriods(cadence, now, -i);
    const key = periodKey(cadence, ts);
    const n = counts[key] ?? 0;
    out.push({ key, label: label(ts), count: n, satisfied: n >= target });
  }
  return out;
}
