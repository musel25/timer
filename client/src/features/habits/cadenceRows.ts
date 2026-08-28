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
  /** When it is meant to happen: "Sat", or "Mon 28 Sep" for a monthly habit —
   *  a bare "28th" leaves you working out the weekday yourself. */
  label: string;
  done: number;
  target: number;
  satisfied: boolean;
  /** Its anchor lands on today — the nudge to actually do it. */
  isToday: boolean;
  /**
   * How much runway is left, or null once the period is satisfied. Two different
   * facts, because they answer different questions: while the anchor is ahead
   * it says when the habit is *meant* to happen ("in 2 days"); once the anchor
   * has passed it switches to the real deadline — the end of the period —
   * because that is what you have left ("3 days left").
   */
  due: string | null;
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
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return habits
    .map((h) => {
      const cadence = cadenceOf(h);
      const monthly = cadence === 'monthly';
      const anchor = h.anchor ?? 1;
      const target = targetOf(h);
      const done = occurrencesByPeriod(h, sessions)[periodKey(cadence, now)] ?? 0;
      const satisfied = done >= target;

      // Position within the period, and how much of it is left. Weeks are
      // measured Monday-first to match the ISO week the streak counts, whatever
      // day the display happens to start on.
      const here = monthly ? today.getDate() : (today.getDay() + 6) % 7;
      const there = monthly ? anchor : (anchor + 6) % 7;
      const lastOfPeriod = monthly ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : 6;
      const leftInPeriod = lastOfPeriod - here;

      let due: string | null = null;
      if (!satisfied) {
        if (there === here) due = 'today';
        else if (there > here) due = `in ${plural(there - here, 'day')}`;
        else due = leftInPeriod === 0 ? 'last day' : `${plural(leftInPeriod, 'day')} left`;
      }

      return {
        habit: h,
        label: monthly
          ? new Date(today.getFullYear(), today.getMonth(), anchor)
              .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
          : WEEKDAY_SHORT[anchor % 7],
        done,
        target,
        satisfied,
        isToday: there === here,
        due,
        // Sort key only: weekly days rotate to start at weekStart.
        order: monthly ? anchor : (anchor - weekStart + 7) % 7,
      };
    })
    .sort((a, b) => a.order - b.order || a.habit.name.localeCompare(b.habit.name))
    .map(({ order: _order, ...row }) => row);
}
