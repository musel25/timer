import { describe, it, expect } from 'vitest';
import { newlyWaiting } from './alerts';
import type { SessionCard } from './types';

function card(p: Partial<SessionCard>): SessionCard {
  return {
    sessionId: 's', cwd: '/p', project: 'p', entrypoint: 'cli', state: 'running',
    startedAt: 0, lastEventAt: 0, updatedAt: 0, registrySeenAt: 0, isStale: false, source: 'hook',
    ...p,
  };
}

describe('newlyWaiting', () => {
  it('returns sessions that just entered the waiting state', () => {
    const cards = [card({ sessionId: 'a', state: 'waiting' }), card({ sessionId: 'b', state: 'running' })];
    expect(newlyWaiting(new Set(), cards)).toEqual(['a']);
  });

  it('does not re-alert for a session already known to be waiting', () => {
    const cards = [card({ sessionId: 'a', state: 'waiting' })];
    expect(newlyWaiting(new Set(['a']), cards)).toEqual([]);
  });

  it('re-alerts when a session re-enters waiting after leaving it', () => {
    // prev reflects the last computed waiting set — empty after it went running
    const cards = [card({ sessionId: 'a', state: 'waiting' })];
    expect(newlyWaiting(new Set(), cards)).toEqual(['a']);
  });
});
