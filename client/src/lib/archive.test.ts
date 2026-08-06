import { describe, expect, it } from 'vitest';
import { isArchived } from './archive';

describe('isArchived', () => {
  it('treats a timestamp as archived and null as inbox', () => {
    expect(isArchived({ archivedAt: 1700000000000 })).toBe(true);
    expect(isArchived({ archivedAt: null })).toBe(false);
  });

  it('treats a missing field as inbox, not archived', () => {
    // A stale server or a cached pre-archive API response omits the field;
    // reading that as archived would empty the inbox entirely.
    expect(isArchived({})).toBe(false);
  });
});
