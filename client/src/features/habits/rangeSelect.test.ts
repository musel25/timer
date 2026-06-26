import { describe, expect, it } from 'vitest';
import { INITIAL_RANGE, tapDay } from './rangeSelect';

describe('tapDay range state machine', () => {
  it('first tap on an unmarked day sets pending start, no commit', () => {
    const r = tapDay(INITIAL_RANGE, '2026-07-10', false);
    expect(r.state.pendingStart).toBe('2026-07-10');
    expect(r.commit).toBeNull();
    expect(r.clearDay).toBeNull();
  });
  it('second tap commits the inclusive range and resets', () => {
    const a = tapDay(INITIAL_RANGE, '2026-07-10', false);
    const b = tapDay(a.state, '2026-07-12', false);
    expect(b.commit).toEqual({ start: '2026-07-10', end: '2026-07-12' });
    expect(b.state.pendingStart).toBeNull();
  });
  it('orders the range when end < start', () => {
    const a = tapDay(INITIAL_RANGE, '2026-07-12', false);
    const b = tapDay(a.state, '2026-07-10', false);
    expect(b.commit).toEqual({ start: '2026-07-10', end: '2026-07-12' });
  });
  it('tapping the pending-start day again cancels', () => {
    const a = tapDay(INITIAL_RANGE, '2026-07-10', false);
    const b = tapDay(a.state, '2026-07-10', false);
    expect(b.state.pendingStart).toBeNull();
    expect(b.commit).toBeNull();
  });
  it('tapping a marked day with no pending start requests a single-day clear', () => {
    const r = tapDay(INITIAL_RANGE, '2026-07-10', true);
    expect(r.clearDay).toBe('2026-07-10');
    expect(r.commit).toBeNull();
  });
});
