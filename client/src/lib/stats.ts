import type { Habit, Session } from './types';
import { dayKey, startOfToday, addDays } from './time';

/** Legacy guard: the old focus-session "umbrella" (since removed) overlapped the
 *  habit runs inside it, so any such historical row must stay excluded from
 *  "time spent" totals to avoid double-counting. New sessions are never 'focus'. */
const isFocusUmbrella = (s: Session) => s.category === 'focus';

/** Minutes per local day, keyed "YYYY-MM-DD" (uses actual time spent). */
export function minutesByDay(sessions: Session[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (isFocusUmbrella(s)) continue;
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

/**
 * Consecutive days with at least one completed session, ending today or
 * yesterday. Dates in `restDays` (local 'YYYY-MM-DD' keys) are transparent:
 * they never break the streak and never add to it — the same way rest days
 * are treated in {@link goalStreak}.
 */
export function currentStreak(sessions: Session[], habitId?: string, restDays: Set<string> = new Set()): number {
  const days = activeDays(sessions, habitId);
  if (days.size === 0) return 0;
  const isRest = (ts: number) => restDays.has(dayKey(ts));
  const back = (ts: number) => {
    let c = addDays(ts, -1);
    while (isRest(c)) c = addDays(c, -1);
    return c;
  };
  let cursor = startOfToday();
  while (isRest(cursor)) cursor = addDays(cursor, -1); // a rest day today is transparent
  if (!days.has(dayKey(cursor))) {
    cursor = back(cursor); // grace: fall back to the nearest non-rest prior day
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = back(cursor);
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
  const s = sessions.filter((x) => x.startedAt >= t0 && x.startedAt < t1 && x.completed && !isFocusUmbrella(x));
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
  for (const s of sessions) if (!isFocusUmbrella(s) && s.startedAt >= fromTs && s.startedAt <= toTs) m += s.actualSeconds / 60;
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

/** Minimal habit shape needed to resolve a day's goal. */
type GoalHabit = { id: string; dailyGoalMin: number | null; weekendGoalMin?: number | null; vacationGoalMin?: number | null };

/**
 * The configured goal (minutes) a habit must reach on the local day at `ts`,
 * or null when no goal is configured for that day's tier. Vacation days use the
 * vacation goal, falling back to the weekend goal then the daily goal; weekends
 * use the weekend goal, falling back to the daily goal; weekdays use the daily
 * goal. No 10-minute fallback here — that stays inside goalStreak so it does not
 * leak into the completion/auto-hide check.
 */
export function effectiveGoal(habit: GoalHabit, ts: number, vacationDays: Set<string>): number | null {
  const daily = habit.dailyGoalMin && habit.dailyGoalMin > 0 ? habit.dailyGoalMin : null;
  const weekend = habit.weekendGoalMin && habit.weekendGoalMin > 0 ? habit.weekendGoalMin : null;
  const vacation = habit.vacationGoalMin && habit.vacationGoalMin > 0 ? habit.vacationGoalMin : null;
  if (vacationDays.has(dayKey(ts))) return vacation ?? weekend ?? daily;
  if (isWeekend(ts)) return weekend ?? daily;
  return daily;
}

/**
 * Consecutive days (ending today, or yesterday when today isn't met yet) on
 * which the habit reached its per-day {@link effectiveGoal} — or at least 10
 * minutes when that day has no configured goal. Dates in `restDays` are
 * invisible (never break, never count). Vacation days are NOT skipped: they
 * simply demand the lighter vacation goal.
 */
export function goalStreak(
  sessions: Session[],
  habit: GoalHabit,
  restDays: Set<string> = new Set(),
  vacationDays: Set<string> = new Set(),
): number {
  const minByDay: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.completed || s.habitId !== habit.id) continue;
    const k = dayKey(s.startedAt);
    minByDay[k] = (minByDay[k] ?? 0) + s.actualSeconds / 60;
  }
  const need = (ts: number) => effectiveGoal(habit, ts, vacationDays) ?? 10; // no goal → any 10-min day
  const met = (ts: number) => (minByDay[dayKey(ts)] ?? 0) >= need(ts) - 1e-9;
  const skip = (ts: number) => restDays.has(dayKey(ts));
  const back = (ts: number) => {
    let c = addDays(ts, -1);
    while (skip(c)) c = addDays(c, -1);
    return c;
  };
  let cursor = startOfToday();
  while (skip(cursor)) cursor = addDays(cursor, -1);
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

/**
 * The streak to show for a habit: clean-day {@link currentStreak} for abstinence
 * habits, goal-met {@link goalStreak} for time habits. `restDays` bridge both;
 * `vacationDays` apply the lighter goal to time habits.
 */
export function habitStreak(habit: Habit, sessions: Session[], restDays: Set<string> = new Set(), vacationDays: Set<string> = new Set()): number {
  return habit.kind === 'abstain'
    ? currentStreak(sessions, habit.id, restDays)
    : goalStreak(sessions, habit, restDays, vacationDays);
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

/** Per-habit version of {@link heatmap}: last `days` local days (oldest first),
 *  each with that habit's minutes and whether any completed session occurred. */
export function habitHeatmap(sessions: Session[], days: number, habitId: string): { date: string; minutes: number; done: boolean }[] {
  const minByDay: Record<string, number> = {};
  const doneDays = new Set<string>();
  for (const s of sessions) {
    if (s.habitId !== habitId || !s.completed) continue;
    const k = dayKey(s.startedAt);
    minByDay[k] = (minByDay[k] ?? 0) + s.actualSeconds / 60;
    doneDays.add(k);
  }
  const t0 = startOfToday();
  const out: { date: string; minutes: number; done: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(addDays(t0, -i));
    out.push({ date: k, minutes: Math.round(minByDay[k] ?? 0), done: doneDays.has(k) });
  }
  return out;
}

/** Whether a habit counts as completed for today (drives the dashboard auto-hide).
 *  Abstain → marked today. Time → minutes reach today's effective goal; a habit
 *  with no configured goal today is never auto-completed. */
export function isHabitDoneToday(habit: Habit, summary: TodaySummary, effectiveGoalToday: number | null): boolean {
  if (habit.kind === 'abstain') return summary.doneHabitIds.has(habit.id);
  if (effectiveGoalToday == null) return false;
  return (summary.minutesByHabit[habit.id] ?? 0) >= effectiveGoalToday - 1e-9;
}
