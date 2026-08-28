/**
 * The three-layer habit plan: the daily habits, three weekly, two monthly.
 *
 * Kept here so the fresh-install seed (seed.ts) and the upgrade backfill (db.ts)
 * cannot drift apart — a habit added to one and forgotten in the other would
 * show up on a new machine and not on the existing account, or vice versa.
 *
 * Leanness is the design: nothing else gets added for at least a month, so that
 * the tracker does not become the chore it exists to displace.
 */

export interface PlannedHabit {
  name: string;
  emoji: string;
  note: string | null;
  /** Habit group by name; weekly/monthly habits are ungrouped — they surface via
   *  their anchor day in the weekly/monthly agenda, not a time-of-day group. */
  group: 'Morning' | 'Work' | 'Night' | null;
  kind: 'time' | 'check';
  cadence: 'daily' | 'weekly' | 'monthly';
  /** Weekly: weekday 0-6 (0 = Sunday). Monthly: day of month 1-28. */
  anchor: number | null;
  targetCount: number;
  template: string | null;
  durations: number[];
  defaultDurationMin: number | null;
  /** Daily: the per-day goal. Weekly/monthly 'time' habits: the per-occurrence
   *  floor a session must clear to count (Music 20 min, Nature 30 min). */
  dailyGoalMin: number | null;
}

const daily = (
  name: string, emoji: string, note: string | null, group: PlannedHabit['group'],
  goal: number, durations: number[], template: string | null,
): PlannedHabit => ({
  name, emoji, note, group, kind: 'time', cadence: 'daily', anchor: null, targetCount: 1,
  template, durations, defaultDurationMin: goal, dailyGoalMin: goal,
});

/**
 * The daily layer. Journaling and the end-of-day check already exist on older
 * accounts; these are the ones the plan adds, each with the form it logs into.
 */
export const NEW_DAILY: PlannedHabit[] = [
  daily('Portuguese', 'languages', '15–20 min', 'Morning', 15, [5, 10, 15, 20, 25], null),
  daily('LeetCode', 'swords', '1 problem or 20 min', 'Morning', 20, [10, 15, 20, 25, 30, 45], 'leetcode'),
  daily('Read', 'book-open', '20 min', 'Night', 20, [10, 15, 20, 25, 30, 45], 'read'),
];

/**
 * Weekly habits. The anchor is *soft*: it decides when a habit surfaces in Today,
 * never whether it counts — courage opportunities vary by week, and a hard day
 * would force either a faked log or a broken streak. Music and Courage share
 * midweek/weekend deliberately: they are the two that need a standing slot.
 */
export const WEEKLY: PlannedHabit[] = [
  {
    name: 'Music', emoji: 'guitar', note: 'Play — it does not have to be productive practice', group: null,
    kind: 'time', cadence: 'weekly', anchor: 3, targetCount: 2, template: null,
    durations: [20, 30, 45, 60], defaultDurationMin: 20, dailyGoalMin: 20,
  },
  {
    name: 'Courage', emoji: 'flame', note: 'One uncomfortable thing', group: null,
    kind: 'check', cadence: 'weekly', anchor: 6, targetCount: 1, template: 'courage',
    durations: [20], defaultDurationMin: null, dailyGoalMin: null,
  },
  {
    name: 'Weekly review', emoji: 'target', note: 'Review the week and plan the next', group: null,
    kind: 'check', cadence: 'weekly', anchor: 0, targetCount: 1, template: 'weekly-review',
    durations: [20], defaultDurationMin: null, dailyGoalMin: null,
  },
];

/**
 * The monthly layer: one ritual, not several. A separate "beliefs & values"
 * reflection was dropped because Tuesday's journal theme already asks what you
 * might be wrong about every week, and the life review's questions cover the
 * values sweep — a monthly habit that duplicates two existing ones is the kind
 * of thing that quietly turns the tracker back into a chore.
 */
export const MONTHLY: PlannedHabit[] = [
  {
    name: 'Life review', emoji: 'graduation-cap', note: 'Rate the nine areas, then the seven questions', group: null,
    kind: 'check', cadence: 'monthly', anchor: 28, targetCount: 1, template: 'life-review',
    durations: [30], defaultDurationMin: null, dailyGoalMin: null,
  },
];

/** Everything the cadence feature introduces, in display order. */
export const CADENCE_PLAN: PlannedHabit[] = [...NEW_DAILY, ...WEEKLY, ...MONTHLY];

/**
 * Entry forms for habits that already existed before templates did, matched by
 * name. Anything not listed keeps the plain minutes + note composer.
 */
export const TEMPLATE_BY_NAME: Record<string, string> = {
  Journaling: 'journal',
  Reading: 'read',
  LeetCode: 'leetcode',
};
