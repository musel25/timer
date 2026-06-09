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
  doneChips: Set<string>; // `${habitId}:${minutes}`
  minutesByHabit: Record<string, number>;
}

export function todaySummary(sessions: Session[]): TodaySummary {
  const t0 = startOfToday();
  const t1 = addDays(t0, 1);
  const s = sessions.filter((x) => x.startedAt >= t0 && x.startedAt < t1 && x.completed);
  const doneHabitIds = new Set<string>();
  const doneChips = new Set<string>();
  const minutesByHabit: Record<string, number> = {};
  let minutes = 0;
  for (const x of s) {
    minutes += x.actualSeconds / 60;
    if (x.habitId) {
      doneHabitIds.add(x.habitId);
      doneChips.add(`${x.habitId}:${Math.round(x.plannedSeconds / 60)}`);
      minutesByHabit[x.habitId] = (minutesByHabit[x.habitId] ?? 0) + x.actualSeconds / 60;
    }
  }
  return { count: s.length, minutes: Math.round(minutes), doneHabitIds, doneChips, minutesByHabit };
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
