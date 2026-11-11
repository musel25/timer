import type { Phase, Session } from './types';
import { dayKey } from './time';

export interface StudyDay {
  focusSeconds: number;
  sets: number;
}

/** A set can contain several work intervals. All of them must finish. */
export function completedSetCount(phases: Phase[], completedWorkIndexes: ReadonlySet<number>): number {
  const sets = new Map<number, number[]>();
  phases.forEach((phase, index) => {
    if (phase.kind !== 'work') return;
    const key = phase.setIndex ?? index;
    sets.set(key, [...(sets.get(key) ?? []), index]);
  });
  return [...sets.values()].filter((indexes) => indexes.every((index) => completedWorkIndexes.has(index))).length;
}

/** Daily timer study totals. Older sessions have no reliable break split. */
export function studyByDay(sessions: Session[]): Record<string, StudyDay> {
  const days: Record<string, StudyDay> = {};
  for (const session of sessions) {
    if (session.habitId || session.category === 'focus' ||
      session.focusSeconds == null || session.completedSets == null) continue;
    const key = dayKey(session.startedAt);
    const day = days[key] ?? { focusSeconds: 0, sets: 0 };
    day.focusSeconds += session.focusSeconds;
    day.sets += session.completedSets;
    days[key] = day;
  }
  return days;
}
