import { describe, it, expect } from 'vitest';
import { sortCards, groupByProject, countByState, waitingCount, askingCount, tally } from './sessionView';
import type { SessionCard } from './types';

function card(p: Partial<SessionCard>): SessionCard {
  return {
    sessionId: Math.random().toString(36).slice(2), cwd: '/p', project: 'p', entrypoint: 'cli',
    state: 'running', startedAt: 0, lastEventAt: 0, updatedAt: 0, registrySeenAt: 0, isStale: false, source: 'hook',
    ...p,
  };
}

describe('sortCards', () => {
  it('orders waiting first, then running, then stale, then finished', () => {
    const cards = [
      card({ sessionId: 'fin', state: 'finished' }),
      card({ sessionId: 'run', state: 'running' }),
      card({ sessionId: 'wait', state: 'waiting' }),
      card({ sessionId: 'stale', state: 'stale' }),
    ];
    expect(sortCards(cards).map((c) => c.sessionId)).toEqual(['wait', 'run', 'stale', 'fin']);
  });

  it('breaks ties by most recent activity', () => {
    const cards = [
      card({ sessionId: 'old', state: 'running', updatedAt: 100 }),
      card({ sessionId: 'new', state: 'running', updatedAt: 200 }),
    ];
    expect(sortCards(cards).map((c) => c.sessionId)).toEqual(['new', 'old']);
  });
});

describe('groupByProject', () => {
  it('groups cards by project and floats groups with a waiting session to the top', () => {
    const cards = [
      card({ project: 'alpha', state: 'running', updatedAt: 10 }),
      card({ project: 'beta', state: 'waiting', updatedAt: 5 }),
      card({ project: 'alpha', state: 'finished', updatedAt: 9 }),
    ];
    const groups = groupByProject(cards);
    expect(groups.map((g) => g.project)).toEqual(['beta', 'alpha']);
    expect(groups[1].cards).toHaveLength(2);
  });
});

describe('countByState / waitingCount', () => {
  it('counts cards per state', () => {
    const cards = [card({ state: 'waiting' }), card({ state: 'waiting' }), card({ state: 'running' }), card({ state: 'finished' })];
    expect(countByState(cards)).toEqual({ waiting: 2, running: 1, finished: 1, stale: 0 });
    expect(waitingCount(cards)).toBe(2);
  });
});

describe('asking vs idle', () => {
  it('sorts a question above an idle-waiting session', () => {
    const cards = [
      card({ sessionId: 'idle', state: 'waiting', subState: 'idle' }),
      card({ sessionId: 'ask', state: 'waiting', subState: 'question' }),
    ];
    expect(sortCards(cards).map((c) => c.sessionId)).toEqual(['ask', 'idle']);
  });

  it('tally splits waiting into asking vs idle; askingCount counts only questions', () => {
    const cards = [
      card({ state: 'waiting', subState: 'question' }),
      card({ state: 'waiting', subState: 'idle' }),
      card({ state: 'waiting', subState: 'idle' }),
      card({ state: 'running' }),
      card({ state: 'finished' }),
    ];
    expect(tally(cards)).toEqual({ asking: 1, idle: 2, running: 1, finished: 1, stale: 0 });
    expect(askingCount(cards)).toBe(1);
  });
});
