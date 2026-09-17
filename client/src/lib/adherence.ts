import type { Habit, Session } from './types';
import { addDays, dayKey, startOfToday } from './time';
import { cadenceOf } from './cadence';
import { effectiveGoal } from './stats';

export interface DayAdherence {
  /** Local day key, 'YYYY-MM-DD'. */
  date: string;
  /** Daily habits completed that day. */
  done: number;
  /** Daily habits the day actually asked for — 0 on a rest day, or before any
   *  habit existed, which is what lets `done/total` stay honest that far back. */
  total: number;
  /** A declared rest day: it asks for nothing and counts for nothing. */
  rest: boolean;
}

/**
 * How closely the last `days` days followed the daily habits — one row per day,
 * oldest first, ending today.
 *
 * This is {@link dailyProgress} extended backwards in time: same rules for what
 * counts (a time habit needs that day's {@link effectiveGoal}; abstinence and
 * check habits need a mark), same exclusion of a time habit with no goal for the
 * day, which can never read as done and would otherwise hold every day below
 * 100% forever. Two things only history has to answer:
 *
 * - A habit contributes nothing to days before it was created. A habit added
 *   yesterday must not paint the week behind it red.
 * - A rest day asks for nothing: `total` is 0 and the row is flagged, so the UI
 *   can draw it as skipped rather than failed. Rest days are transparent to
 *   streaks for the same reason.
 *
 * Archived habits and weekly/monthly cadences are out of scope: this measures
 * the daily rhythm, and a monthly review is not a thing you "follow daily".
 */
export function adherenceDays(
  habits: Habit[],
  sessions: Session[],
  days: number,
  restDays: Set<string> = new Set(),
  vacationDays: Set<string> = new Set(),
  today = startOfToday(),
): DayAdherence[] {
  const daily = habits.filter((h) => !h.archived && cadenceOf(h) === 'daily');

  // One pass over the sessions: minutes per habit per day, and the days each
  // habit was marked at all (what an abstain/check habit needs).
  const minutes = new Map<string, number>();
  const marked = new Set<string>();
  for (const s of sessions) {
    if (!s.completed || !s.habitId || s.category === 'focus') continue;
    const cell = `${s.habitId}|${dayKey(s.startedAt)}`;
    minutes.set(cell, (minutes.get(cell) ?? 0) + s.actualSeconds / 60);
    marked.add(cell);
  }

  const out: DayAdherence[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ts = addDays(today, -i);
    const date = dayKey(ts);
    if (restDays.has(date)) {
      out.push({ date, done: 0, total: 0, rest: true });
      continue;
    }
    let done = 0;
    let total = 0;
    for (const h of daily) {
      if (dayKey(h.createdAt) > date) continue; // did not exist yet
      const goal = effectiveGoal(h, ts, vacationDays);
      if (h.kind === 'time' && !(goal != null && goal > 0)) continue; // never completable
      total += 1;
      const cell = `${h.id}|${date}`;
      const met = h.kind === 'time'
        ? (minutes.get(cell) ?? 0) >= (goal as number) - 1e-9
        : marked.has(cell);
      if (met) done += 1;
    }
    out.push({ date, done, total, rest: false });
  }
  return out;
}
