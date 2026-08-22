import { beforeEach, describe, expect, it } from 'vitest';
import type { Thread } from '../../lib/types';
import { NOTIFY_STALE_MS, dueThreads, loadNotified, saveNotified } from './notify';

const NOW = 1_700_000_000_000;

function t(over: Partial<Thread> & { id: string }): Thread {
  return {
    title: over.id, lane: null, state: 'waiting', nextStep: null, wakeAt: NOW - 1_000,
    waitingOn: null, taskId: null, doneAt: null, touchedAt: NOW, createdAt: NOW,
    ...over,
  };
}

describe('dueThreads', () => {
  it('returns a waiting thread whose timer just fired', () => {
    expect(dueThreads({ threads: [t({ id: 'a' })], now: NOW, notified: [] }).map((x) => x.id)).toEqual(['a']);
  });

  it('does not return a thread that was already notified', () => {
    expect(dueThreads({ threads: [t({ id: 'a' })], now: NOW, notified: ['a'] })).toEqual([]);
  });

  it('does not return a thread whose wakeAt is older than the stale window', () => {
    const ancient = t({ id: 'a', wakeAt: NOW - NOTIFY_STALE_MS - 1 });
    expect(dueThreads({ threads: [ancient], now: NOW, notified: [] })).toEqual([]);
  });

  it('does not return a thread that is not due yet', () => {
    expect(dueThreads({ threads: [t({ id: 'a', wakeAt: NOW + 1 })], now: NOW, notified: [] })).toEqual([]);
  });

  it('returns nothing while nudges are muted', () => {
    expect(dueThreads({ threads: [t({ id: 'a' })], now: NOW, notified: [], muted: true })).toEqual([]);
  });

  it('ignores parked and finished threads', () => {
    const list = [t({ id: 'p', state: 'parked' }), t({ id: 'd', doneAt: NOW })];
    expect(dueThreads({ threads: list, now: NOW, notified: [] })).toEqual([]);
  });
});

describe('notified id persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage so a reload does not re-fire', () => {
    saveNotified(['a', 'b']);
    expect(loadNotified()).toEqual(['a', 'b']);
  });

  it('returns an empty list when storage is empty or corrupt', () => {
    expect(loadNotified()).toEqual([]);
    localStorage.setItem('now.notified', 'not json');
    expect(loadNotified()).toEqual([]);
  });
});
