import { describe, expect, it } from 'vitest';
import { entriesFor, lastEntryFor, seriesFor } from './entries';
import type { Session } from '../../lib/types';

const session = (over: Partial<Session>): Session => ({
  id: Math.random().toString(36).slice(2), habitId: 'h1', timerId: null, label: null,
  type: 'simple', plannedSeconds: 0, actualSeconds: 0, completed: true,
  startedAt: 0, endedAt: 0, note: null, createdAt: 0, ...over,
});

describe('entriesFor', () => {
  const sessions = [
    session({ startedAt: 300, entry: { book: 'Dune' } }),
    session({ startedAt: 100, entry: { book: 'Solaris' } }),
    session({ startedAt: 200, entry: {} }),                        // logged without answers
    session({ startedAt: 400, entry: { book: 'Ubik' }, habitId: 'other' }),
    session({ startedAt: 500, entry: { book: 'Nope' }, completed: false }),
  ];

  it('returns only this habit completed entries, newest first', () => {
    expect(entriesFor(sessions, 'h1').map((e) => e.data.book)).toEqual(['Dune', 'Solaris']);
  });

  it('ignores completions that carried no answers', () => {
    expect(entriesFor(sessions, 'h1')).toHaveLength(2);
  });

  it('prefills from the most recent entry', () => {
    expect(lastEntryFor(sessions, 'h1')).toEqual({ book: 'Dune' });
    expect(lastEntryFor(sessions, 'nothing-logged')).toBeNull();
  });
});

describe('seriesFor', () => {
  const sessions = [
    session({ startedAt: 100, entry: { anticipated: 4, actual: 2 } }),
    session({ startedAt: 200, entry: { anticipated: 5, actual: 1 } }),
    session({ startedAt: 300, entry: { what: 'no ratings that time' } }),
  ];

  it('charts a numeric field oldest first', () => {
    expect(seriesFor(sessions, 'h1', 'anticipated')).toEqual([
      { at: 100, value: 4 },
      { at: 200, value: 5 },
    ]);
  });

  it('skips entries missing the field rather than reading them as zero', () => {
    // An entry logged before a field existed must not drag a chart down to 0.
    expect(seriesFor(sessions, 'h1', 'actual')).toHaveLength(2);
    expect(seriesFor(sessions, 'h1', 'never-asked')).toEqual([]);
  });
});
