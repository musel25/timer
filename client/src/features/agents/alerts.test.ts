import { describe, it, expect } from 'vitest';
import { newlyAsking, askingIds } from './alerts';
import type { SessionCard } from './types';

function card(p: Partial<SessionCard>): SessionCard {
  return {
    sessionId: 's', cwd: '/p', project: 'p', entrypoint: 'cli', state: 'running',
    startedAt: 0, lastEventAt: 0, updatedAt: 0, registrySeenAt: 0, isStale: false, source: 'hook',
    ...p,
  };
}

describe('newlyAsking', () => {
  it('only counts sessions blocked on a question, not idle-waiting ones', () => {
    const cards = [
      card({ sessionId: 'ask', state: 'waiting', subState: 'question' }),
      card({ sessionId: 'idle', state: 'waiting', subState: 'idle' }),
      card({ sessionId: 'run', state: 'running' }),
    ];
    expect(askingIds(cards).sort()).toEqual(['ask']);
    expect(newlyAsking(new Set(), cards)).toEqual(['ask']);
  });

  it('does not re-alert for a question already known', () => {
    const cards = [card({ sessionId: 'ask', state: 'waiting', subState: 'question' })];
    expect(newlyAsking(new Set(['ask']), cards)).toEqual([]);
  });
});
