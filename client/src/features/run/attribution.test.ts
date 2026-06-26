import { describe, expect, it } from 'vitest';
import { attributedHabitId } from './attribution';

describe('attributedHabitId', () => {
  it('prefers the live tag', () => expect(attributedHabitId('h2', 'h1')).toBe('h2'));
  it('falls back to the spec habit', () => expect(attributedHabitId(null, 'h1')).toBe('h1'));
  it('is null when neither set', () => expect(attributedHabitId(null, null)).toBeNull());
  it('is null when neither provided', () => expect(attributedHabitId(null)).toBeNull());
});
