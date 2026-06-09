import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth';

describe('password hashing', () => {
  it('verifies a correct password', () => {
    const h = hashPassword('s3cret-pw');
    expect(verifyPassword('s3cret-pw', h)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const h = hashPassword('s3cret-pw');
    expect(verifyPassword('nope', h)).toBe(false);
  });

  it('produces a unique salt per hash', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
});
