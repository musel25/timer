import { describe, expect, it } from 'vitest';
import { extractTags, isArchived, splitByTags } from './noteTags';

describe('isArchived', () => {
  it('treats a timestamp as archived and null as inbox', () => {
    expect(isArchived({ archivedAt: 1700000000000 })).toBe(true);
    expect(isArchived({ archivedAt: null })).toBe(false);
  });

  it('treats a missing field as inbox, not archived', () => {
    // A stale server or a cached pre-archive /api/notes response omits the
    // field; reading that as archived would empty the inbox entirely.
    expect(isArchived({})).toBe(false);
  });
});

describe('extractTags', () => {
  it('finds hashtags and lowercases them', () => {
    expect(extractTags('Stretch after coffee #Habits #morning')).toEqual(['habits', 'morning']);
  });

  it('dedupes repeated tags', () => {
    expect(extractTags('#idea one #idea two')).toEqual(['idea']);
  });

  it('returns empty for plain text', () => {
    expect(extractTags('just a thought')).toEqual([]);
  });

  it('supports digits, dashes, underscores and accents', () => {
    expect(extractTags('#v2 #self-care #deep_work #café')).toEqual(['v2', 'self-care', 'deep_work', 'café']);
  });
});

describe('splitByTags', () => {
  it('splits text around tags, preserving the original characters', () => {
    const parts = splitByTags('read more #books tonight');
    expect(parts).toEqual([
      { text: 'read more ', isTag: false },
      { text: '#books', isTag: true },
      { text: ' tonight', isTag: false },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe('read more #books tonight');
  });

  it('handles text with no tags', () => {
    expect(splitByTags('hello')).toEqual([{ text: 'hello', isTag: false }]);
  });
});
