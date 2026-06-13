import { describe, it, expect } from 'vitest';
import { tokenOk } from './token';

describe('tokenOk', () => {
  it('accepts a matching token', () => {
    expect(tokenOk('secret', 'secret')).toBe(true);
  });
  it('rejects a wrong or missing token when one is configured', () => {
    expect(tokenOk('nope', 'secret')).toBe(false);
    expect(tokenOk(undefined, 'secret')).toBe(false);
  });
  it('allows any request when no token is configured (local dev convenience)', () => {
    expect(tokenOk(undefined, '')).toBe(true);
    expect(tokenOk('whatever', '')).toBe(true);
  });
});
