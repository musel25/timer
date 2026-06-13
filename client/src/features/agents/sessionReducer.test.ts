import { describe, it, expect } from 'vitest';
import { reduceEvent, type SessionState } from './sessionReducer';
import type { SessionCard } from './types';

function card(p: Partial<SessionCard>): SessionCard {
  return {
    sessionId: 's1', cwd: '/p', project: 'p', entrypoint: 'cli', state: 'running',
    startedAt: 0, lastEventAt: 0, updatedAt: 0, registrySeenAt: 0, isStale: false, source: 'hook',
    ...p,
  };
}
const empty: SessionState = {};

describe('reduceEvent', () => {
  it('replaces all state on a snapshot event', () => {
    const next = reduceEvent({ s0: card({ sessionId: 's0' }) }, 'snapshot', JSON.stringify([card({ sessionId: 'a' }), card({ sessionId: 'b' })]));
    expect(Object.keys(next).sort()).toEqual(['a', 'b']);
  });

  it('upserts a card from an upsert delta', () => {
    const next = reduceEvent(empty, 'upsert', JSON.stringify({ type: 'upsert', card: card({ sessionId: 'x', state: 'waiting' }) }));
    expect(next.x.state).toBe('waiting');
  });

  it('removes a card from a remove delta', () => {
    const start = { x: card({ sessionId: 'x' }), y: card({ sessionId: 'y' }) };
    const next = reduceEvent(start, 'remove', JSON.stringify({ type: 'remove', sessionId: 'x' }));
    expect(Object.keys(next)).toEqual(['y']);
  });

  it('ignores ping and unknown events', () => {
    const start = { x: card({ sessionId: 'x' }) };
    expect(reduceEvent(start, 'ping', '123')).toBe(start);
    expect(reduceEvent(start, 'mystery', '{}')).toBe(start);
  });

  it('is resilient to malformed data', () => {
    const start = { x: card({ sessionId: 'x' }) };
    expect(reduceEvent(start, 'upsert', 'not json')).toBe(start);
  });
});
