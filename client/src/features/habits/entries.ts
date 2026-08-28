import type { EntryData, Session } from '../../lib/types';

/** A past completion that carried structured answers. */
export interface LoggedEntry {
  id: string;
  at: number;
  periodKey: string | null;
  minutes: number;
  data: EntryData;
}

/** Every structured entry a habit has recorded, newest first. */
export function entriesFor(sessions: Session[], habitId: string): LoggedEntry[] {
  return sessions
    .filter((s) => s.habitId === habitId && s.completed && s.entry && Object.keys(s.entry).length > 0)
    .map((s) => ({
      id: s.id,
      at: s.startedAt,
      periodKey: s.periodKey ?? null,
      minutes: Math.round(s.actualSeconds / 60),
      data: s.entry as EntryData,
    }))
    .sort((a, b) => b.at - a.at);
}

/**
 * The most recent entry's answers, used to prefill carry-over fields — the book
 * you are still reading should not have to be retyped every night.
 */
export function lastEntryFor(sessions: Session[], habitId: string): EntryData | null {
  return entriesFor(sessions, habitId)[0]?.data ?? null;
}

/**
 * A numeric field's history, oldest first, for charting. Skips entries where the
 * field is absent or non-numeric, so an entry logged before a field existed does
 * not read as a zero.
 */
export function seriesFor(sessions: Session[], habitId: string, field: string): { at: number; value: number }[] {
  return entriesFor(sessions, habitId)
    .filter((e) => typeof e.data[field] === 'number')
    .map((e) => ({ at: e.at, value: e.data[field] as number }))
    .reverse();
}
