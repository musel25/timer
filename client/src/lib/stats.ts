import type { Session } from './types';
import { dayKey, startOfToday, addDays } from './time';

/** Minutes per local day, keyed "YYYY-MM-DD" (uses actual time spent). */
export function minutesByDay(sessions: Session[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    const k = dayKey(s.startedAt);
    out[k] = (out[k] ?? 0) + s.actualSeconds / 60;
  }
  return out;
}

function activeDays(sessions: Session[], habitId?: string): Set<string> {
  const set = new Set<string>();
  for (const s of sessions) {
    if (!s.completed) continue;
    if (habitId && s.habitId !== habitId) continue;
    set.add(dayKey(s.startedAt));
  }
  return set;
}

/** Consecutive days with at least one completed session, ending today or yesterday. */
export function currentStreak(sessions: Session[], habitId?: string): number {
  const days = activeDays(sessions, habitId);
  if (days.size === 0) return 0;
  const today = startOfToday();
  let cursor = today;
  if (!days.has(dayKey(today))) {
    const y = addDays(today, -1);
    if (days.has(dayKey(y))) cursor = y;
    else return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface TodaySummary {
  count: number;
  minutes: number;
  doneHabitIds: Set<string>;
  minutesByHabit: Record<string, number>;
}

export function todaySummary(sessions: Session[]): TodaySummary {
  const t0 = startOfToday();
  const t1 = addDays(t0, 1);
  const s = sessions.filter((x) => x.startedAt >= t0 && x.startedAt < t1 && x.completed);
  const doneHabitIds = new Set<string>();
  const minutesByHabit: Record<string, number> = {};
  let minutes = 0;
  for (const x of s) {
    minutes += x.actualSeconds / 60;
    if (x.habitId) {
      doneHabitIds.add(x.habitId);
      minutesByHabit[x.habitId] = (minutesByHabit[x.habitId] ?? 0) + x.actualSeconds / 60;
    }
  }
  return { count: s.length, minutes: Math.round(minutes), doneHabitIds, minutesByHabit };
}

/** Today's most recent completed session for a habit, or null. Used to toggle an
 *  abstinence "stayed clean today" check back off by deleting the day's mark. */
export function todaysHabitSession(sessions: Session[], habitId: string): Session | null {
  const t0 = startOfToday();
  const t1 = addDays(t0, 1);
  return sessions.find((s) => s.habitId === habitId && s.completed && s.startedAt >= t0 && s.startedAt < t1) ?? null;
}

export function minutesInRange(sessions: Session[], fromTs: number, toTs = Date.now()): number {
  let m = 0;
  for (const s of sessions) if (s.startedAt >= fromTs && s.startedAt <= toTs) m += s.actualSeconds / 60;
  return Math.round(m);
}

export function minutesByHabitInRange(sessions: Session[], fromTs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (s.startedAt < fromTs || !s.habitId) continue;
    out[s.habitId] = (out[s.habitId] ?? 0) + s.actualSeconds / 60;
  }
  return out;
}

/** Array of the last `days` local days (oldest first) with minutes. */
export function heatmap(sessions: Session[], days: number): { date: string; minutes: number }[] {
  const byDay = minutesByDay(sessions);
  const t0 = startOfToday();
  const out: { date: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(addDays(t0, -i));
    out.push({ date: k, minutes: Math.round(byDay[k] ?? 0) });
  }
  return out;
}

const isWeekend = (ts: number) => {
  const day = new Date(ts).getDay();
  return day === 0 || day === 6;
};

/**
 * Consecutive days (ending today, or yesterday when today isn't met yet) on
 * which the habit reached its daily goal in minutes — or at least 10 minutes
 * when it has no goal. With `weekdaysOnly`, Saturdays and Sundays are invisible:
 * they never break the streak and never count toward it.
 */
export function goalStreak(sessions: Session[], habitId: string, dailyGoalMin: number | null, weekdaysOnly = false): number {
  const need = dailyGoalMin && dailyGoalMin > 0 ? dailyGoalMin : 10; // no goal → any 10-min day
  const minByDay: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.completed || s.habitId !== habitId) continue;
    const k = dayKey(s.startedAt);
    minByDay[k] = (minByDay[k] ?? 0) + s.actualSeconds / 60;
  }
  const met = (ts: number) => (minByDay[dayKey(ts)] ?? 0) >= need - 1e-9;
  const back = (ts: number) => {
    let c = addDays(ts, -1);
    while (weekdaysOnly && isWeekend(c)) c = addDays(c, -1);
    return c;
  };
  let cursor = startOfToday();
  while (weekdaysOnly && isWeekend(cursor)) cursor = addDays(cursor, -1);
  if (!met(cursor)) {
    cursor = back(cursor);
    if (!met(cursor)) return 0;
  }
  let streak = 0;
  while (met(cursor)) {
    streak += 1;
    cursor = back(cursor);
  }
  return streak;
}

/** Minutes of habit-less (focus/timer) sessions since `fromTs`. */
export function focusMinutes(sessions: Session[], fromTs: number): number {
  let m = 0;
  for (const s of sessions) {
    if (s.habitId || s.startedAt < fromTs) continue;
    m += s.actualSeconds / 60;
  }
  return m;
}
