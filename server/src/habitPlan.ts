/**
 * The V1 three-layer habit plan: four daily habits, six weekly, four monthly.
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

/** The one daily habit missing from the original seed. */
export const NEW_DAILY: PlannedHabit[] = [
  daily('Portuguese', 'languages', '15–20 min', 'Morning', 15, [5, 10, 15, 20, 25], null),
];

/**
 * Weekly habits. Anchors are spread across the week so no single day carries
 * more than one, and they are *soft*: the anchor decides when a habit surfaces
 * in Today, never whether it counts. Courage and social opportunities vary by
 * week — a hard day would force either a faked log or a broken streak.
 */
export const WEEKLY: PlannedHabit[] = [
  {
    name: 'Courage', emoji: 'flame', note: 'One uncomfortable thing', group: null,
    kind: 'check', cadence: 'weekly', anchor: 3, targetCount: 1, template: 'courage',
    durations: [20], defaultDurationMin: null, dailyGoalMin: null,
  },
  {
    name: 'Connection', emoji: 'heart', note: 'One intentional conversation with someone you care about', group: null,
    kind: 'check', cadence: 'weekly', anchor: 5, targetCount: 1, template: null,
    durations: [30], defaultDurationMin: null, dailyGoalMin: null,
  },
  {
    name: 'Music', emoji: 'guitar', note: 'Play — it does not have to be productive practice', group: null,
    kind: 'time', cadence: 'weekly', anchor: 2, targetCount: 2, template: null,
    durations: [20, 30, 45, 60], defaultDurationMin: 20, dailyGoalMin: 20,
  },
  {
    name: 'Nature', emoji: 'sprout', note: 'Somewhere pleasant, 30 min+', group: null,
    kind: 'time', cadence: 'weekly', anchor: 6, targetCount: 1, template: null,
    durations: [30, 45, 60, 90], defaultDurationMin: 45, dailyGoalMin: 30,
  },
  {
    name: 'Create', emoji: 'palette', note: 'Produce something that did not exist before', group: null,
    kind: 'check', cadence: 'weekly', anchor: 4, targetCount: 1, template: null,
    durations: [30], defaultDurationMin: null, dailyGoalMin: null,
  },
  {
    name: 'Weekly review', emoji: 'target', note: 'Review the week and plan the next', group: null,
    kind: 'check', cadence: 'weekly', anchor: 0, targetCount: 1, template: 'weekly-review',
    durations: [20], defaultDurationMin: null, dailyGoalMin: null,
  },
];

/** Monthly habits, spread a week apart so they never all land on one day. */
export const MONTHLY: PlannedHabit[] = [
  {
    name: 'Simplify', emoji: 'ban', note: 'Declutter one thing — possessions, apps, commitments', group: null,
    kind: 'check', cadence: 'monthly', anchor: 7, targetCount: 1, template: 'simplify',
    durations: [30], defaultDurationMin: null, dailyGoalMin: null,
  },
  {
    name: 'Try something new', emoji: 'sun', note: 'One thing you have never done before', group: null,
    kind: 'check', cadence: 'monthly', anchor: 14, targetCount: 1, template: null,
    durations: [60], defaultDurationMin: null, dailyGoalMin: null,
  },
  {
    name: 'Beliefs & values', emoji: 'brain', note: 'Long-form reflection', group: null,
    kind: 'check', cadence: 'monthly', anchor: 21, targetCount: 1, template: null,
    durations: [30], defaultDurationMin: null, dailyGoalMin: null,
  },
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
