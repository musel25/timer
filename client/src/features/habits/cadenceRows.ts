import type { Habit, Session } from '../../lib/types';
import { cadenceOf, occurrencesByPeriod, periodKey, targetOf } from '../../lib/cadence';

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "1st", "2nd", "3rd", "7th", "21st"… for a monthly habit's day. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** A weekly/monthly habit as one row of the layer's agenda. */
export interface CadenceRow {
  habit: Habit;
  /** When it is meant to happen: "Sat" or "28th". */
  label: string;
  done: number;
  target: number;
  satisfied: boolean;
  /** Its anchor lands on today — the nudge to actually do it. */
  isToday: boolean;
}

/**
 * The habits of one cadence layer, ordered by when they come round, so the
 * section reads as a plan for the week (or the month) rather than a pile of
 * habits with no stated time.
 *
 * Weekly rows start at the user's `weekStart` so the list matches the week they
 * actually think in; monthly rows run 1st → 28th.
 */
export function cadenceRows(
  habits: Habit[],
  sessions: Session[],
  weekStart = 1,
  now = Date.now(),
): CadenceRow[] {
  const today = new Date(now);
  return habits
    .map((h) => {
      const cadence = cadenceOf(h);
      const monthly = cadence === 'monthly';
      const anchor = h.anchor ?? 1;
      const target = targetOf(h);
      const done = occurrencesByPeriod(h, sessions)[periodKey(cadence, now)] ?? 0;
      return {
        habit: h,
        label: monthly ? ordinal(anchor) : WEEKDAY_SHORT[anchor % 7],
        done,
        target,
        satisfied: done >= target,
        isToday: monthly ? anchor === today.getDate() : anchor % 7 === today.getDay(),
        // Sort key only: weekly days rotate to start at weekStart.
        order: monthly ? anchor : (anchor - weekStart + 7) % 7,
      };
    })
    .sort((a, b) => a.order - b.order || a.habit.name.localeCompare(b.habit.name))
    .map(({ order: _order, ...row }) => row);
}
