import type { Session } from './types';

/** Payload for POST /api/sessions (server fills id/userId/createdAt). */
export type ManualSessionInput = Pick<
  Session,
  'habitId' | 'timerId' | 'label' | 'type' | 'plannedSeconds' | 'actualSeconds' | 'completed' | 'startedAt' | 'endedAt' | 'note'
>;

/**
 * Build a completed session logged by hand for a habit — no timer involved.
 * The window ends `now` and runs back `minutes`, so it counts toward today's
 * blocks/streaks exactly like a finished timer run. See the manual-logging spec.
 */
export function buildManualSession(habitId: string, minutes: number, now: number): ManualSessionInput {
  const seconds = Math.round(minutes * 60);
  return {
    habitId,
    timerId: null,
    label: null,
    type: 'simple',
    plannedSeconds: seconds,
    actualSeconds: seconds,
    completed: true,
    startedAt: now - seconds * 1000,
    endedAt: now,
    note: null,
  };
}
