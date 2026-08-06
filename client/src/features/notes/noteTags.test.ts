import { describe, expect, it } from 'vitest';
import { extractTags, splitByTags } from './noteTags';

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
