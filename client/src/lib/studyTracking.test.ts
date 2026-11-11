import { describe, expect, it } from 'vitest';
import { addDays, dayKey, startOfToday } from './time';
import { completedSetCount, studyByDay } from './studyTracking';
import type { Phase, Session } from './types';

const today = startOfToday() + 12 * 3600_000;
function row(at: number, overrides: Partial<Session> = {}): Session {
  return {
    id: String(at), habitId: null, timerId: 'timer', label: 'Study', type: 'interval',
    plannedSeconds: 3600, actualSeconds: 3600, completed: true,
    startedAt: at, endedAt: at + 3600_000, note: null, createdAt: at,
    ...overrides,
  };
}

describe('studyByDay', () => {
  it('sums completed focus sets across timer runs on the local day', () => {
    const result = studyByDay([
      row(today, { focusSeconds: 1500, completedSets: 1 }),
      row(today + 3600_000, { focusSeconds: 3000, completedSets: 2 }),
      row(addDays(today, -1), { focusSeconds: 600, completedSets: 1 }),
    ]);
    expect(result[dayKey(today)]).toEqual({ focusSeconds: 4500, sets: 3 });
    expect(result[dayKey(addDays(today, -1))]).toEqual({ focusSeconds: 600, sets: 1 });
  });

  it('excludes habits, legacy timer rows, and old focus umbrellas', () => {
    expect(studyByDay([
      row(today, { habitId: 'habit', focusSeconds: 1500, completedSets: 1 }),
      row(today, { focusSeconds: null, completedSets: null }),
      row(today, { category: 'focus', focusSeconds: 3600, completedSets: 2 }),
    ])).toEqual({});
  });
});

it('counts one interval set only after all of its work phases finish', () => {
  const phases = [
    { kind: 'work', setIndex: 1 }, { kind: 'rest', setIndex: 1 }, { kind: 'work', setIndex: 1 },
    { kind: 'work', setIndex: 2 }, { kind: 'work', setIndex: 2 },
  ] as Phase[];
  expect(completedSetCount(phases, new Set([0, 3, 4]))).toBe(1);
  expect(completedSetCount(phases, new Set([0, 2, 3, 4]))).toBe(2);
});
