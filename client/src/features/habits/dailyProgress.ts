import type { Habit, Session } from '../../lib/types';
import { effectiveGoal, isHabitDoneToday, todaySummary } from '../../lib/stats';
import { cadenceOf } from '../../lib/cadence';
import { startOfToday } from '../../lib/time';

export interface DailyProgress {
  /** Daily habits finished today. */
  done: number;
  /** Daily habits that *can* be finished today (see below). */
  total: number;
  minutes: number;
  goalMinutes: number;
}

/**
 * Where today stands: "2/5 · 35 of 80 min".
 *
 * A count with nothing to compare it against — the old header's "1 done · 20
 * min" — tells you nothing, which is the failure this fixes: you could not see
 * whether you were on track without adding the goals up in your head.
 *
 * Counted are the daily habits that can actually be *completed* today: a time
 * habit with a goal, an abstinence check, a plain check. A time habit with no
 * goal configured is excluded, because `isHabitDoneToday` never reports it done
 * and it would hold the fraction below 100% forever. Minutes come only from the
 * habits that have a goal, so the two numbers describe the same set of work.
 */
export function dailyProgress(
  habits: Habit[],
  sessions: Session[],
  vacationDays: Set<string> = new Set(),
  ts = startOfToday(),
): DailyProgress {
  const summary = todaySummary(sessions);
  const daily = habits.filter((h) => !h.archived && cadenceOf(h) === 'daily');

  let done = 0;
  let total = 0;
  let minutes = 0;
  let goalMinutes = 0;

  for (const h of daily) {
    const goal = effectiveGoal(h, ts, vacationDays);
    const completable = h.kind !== 'time' || (goal != null && goal > 0);
    if (!completable) continue;
    total += 1;
    if (isHabitDoneToday(h, summary, goal, sessions)) done += 1;
    if (h.kind === 'time' && goal) {
      goalMinutes += goal;
      // Cap at the goal: 40 minutes of reading should not paper over an
      // untouched habit and read as "on track" overall.
      minutes += Math.min(summary.minutesByHabit[h.id] ?? 0, goal);
    }
  }

  return { done, total, minutes: Math.round(minutes), goalMinutes };
}
