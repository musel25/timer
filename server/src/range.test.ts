import { describe, expect, it } from 'vitest';
import { datesInclusive, MAX_RANGE_DAYS } from './range';

describe('datesInclusive', () => {
  it('returns a single day when start === end', () => {
    expect(datesInclusive('2026-07-10', '2026-07-10')).toEqual(['2026-07-10']);
  });
  it('returns every inclusive day across a month boundary', () => {
    expect(datesInclusive('2026-06-29', '2026-07-02')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
    ]);
  });
  it('throws when start > end', () => {
    expect(() => datesInclusive('2026-07-10', '2026-07-09')).toThrow();
  });
  it('throws when the range exceeds MAX_RANGE_DAYS', () => {
    expect(() => datesInclusive('2024-01-01', '2026-01-01')).toThrow();
    expect(MAX_RANGE_DAYS).toBe(366);
  });
});
