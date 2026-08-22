import { describe, expect, it } from 'vitest';
import type { Thread } from '../../lib/types';
import { activeThread, atCap, inFlight, isReady, nextUp, readyCount } from './nextUp';

const NOW = 1_700_000_000_000;

function t(over: Partial<Thread> & { id: string }): Thread {
  return {
    title: over.id, lane: null, state: 'parked', nextStep: null, wakeAt: null,
    waitingOn: null, taskId: null, doneAt: null, touchedAt: NOW, createdAt: NOW,
    ...over,
  };
}

describe('inFlight / atCap', () => {
  it('counts only threads that have not been finished', () => {
    const list = [t({ id: 'a' }), t({ id: 'b' }), t({ id: 'c', doneAt: NOW - 1000 })];
    expect(inFlight(list).map((x) => x.id)).toEqual(['a', 'b']);
    expect(atCap(list, 3)).toBe(false);
    expect(atCap(list, 2)).toBe(true);
  });
});

describe('isReady / readyCount', () => {
  it('is ready only when waiting with a wakeAt that has passed', () => {
    expect(isReady(t({ id: 'a', state: 'waiting', wakeAt: NOW - 1 }), NOW)).toBe(true);
    expect(isReady(t({ id: 'b', state: 'waiting', wakeAt: NOW + 1 }), NOW)).toBe(false);
    expect(isReady(t({ id: 'c', state: 'waiting', wakeAt: null }), NOW)).toBe(false);
    expect(isReady(t({ id: 'd', state: 'parked', wakeAt: NOW - 1 }), NOW)).toBe(false);
  });

  it('does not count a finished thread as ready', () => {
    const list = [t({ id: 'a', state: 'waiting', wakeAt: NOW - 1, doneAt: NOW })];
    expect(readyCount(list, NOW)).toBe(0);
  });
});

describe('activeThread', () => {
  it('returns the single active thread, or null', () => {
    expect(activeThread([t({ id: 'a' })])).toBeNull();
    expect(activeThread([t({ id: 'a' }), t({ id: 'b', state: 'active' })])?.id).toBe('b');
  });
});

describe('nextUp', () => {
  it('returns null on an empty board', () => {
    expect(nextUp([], NOW)).toBeNull();
  });

  it('prefers the thread that has been ready longest', () => {
    const list = [
      t({ id: 'recent', state: 'waiting', wakeAt: NOW - 1_000 }),
      t({ id: 'oldest', state: 'waiting', wakeAt: NOW - 60_000 }),
    ];
    expect(nextUp(list, NOW)).toEqual({ thread: expect.objectContaining({ id: 'oldest' }), reason: 'ready' });
  });

  it('surfaces a ready thread even while another thread is active', () => {
    const list = [
      t({ id: 'act', state: 'active' }),
      t({ id: 'rdy', state: 'waiting', wakeAt: NOW - 5 }),
    ];
    expect(nextUp(list, NOW)?.thread.id).toBe('rdy');
  });

  it('falls back to the stalest parked thread when nothing is ready', () => {
    const list = [
      t({ id: 'fresh', touchedAt: NOW - 1_000 }),
      t({ id: 'stale', touchedAt: NOW - 900_000 }),
      t({ id: 'later', state: 'waiting', wakeAt: NOW + 60_000 }),
    ];
    expect(nextUp(list, NOW)).toEqual({ thread: expect.objectContaining({ id: 'stale' }), reason: 'stalest' });
  });

  it('never suggests the active thread or a finished one', () => {
    const list = [t({ id: 'act', state: 'active' }), t({ id: 'done', doneAt: NOW })];
    expect(nextUp(list, NOW)).toBeNull();
  });
});
