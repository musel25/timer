import type { Session } from './types';

/** Payload for POST /api/sessions (server fills id/userId/createdAt). */
export type ManualSessionInput = Pick<
  Session,
  'habitId' | 'timerId' | 'label' | 'type' | 'plannedSeconds' | 'actualSeconds' | 'completed' | 'startedAt' | 'endedAt' | 'note'
>;

/**
 * Build a completed session logged by hand for a habit — no timer involved.
 * The window ends at `endedAt` (default now) and runs back `minutes`, so it
 * counts toward that day's minutes/streaks exactly like a finished run would.
 * Pass an `endedAt` inside an earlier day to back-date the log (e.g. yesterday);
 * `note` records what was done.
 */
export function buildManualSession(
  habitId: string,
  minutes: number,
  endedAt: number,
  note: string | null = null,
): ManualSessionInput {
  const seconds = Math.round(minutes * 60);
  return {
    habitId,
    timerId: null,
    label: null,
    type: 'simple',
    plannedSeconds: seconds,
    actualSeconds: seconds,
    completed: true,
    startedAt: endedAt - seconds * 1000,
    endedAt,
    note: note?.trim() ? note.trim() : null,
  };
}
