import { describe, expect, it } from 'vitest';
import { JOURNAL_THEMES, LIFE_AREAS, templateFor } from './templates';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe('templateFor', () => {
  it('resolves the journal theme from the weekday', () => {
    expect(templateFor('journal', at(2026, 8, 24))?.prompt?.theme).toBe('Self-awareness');   // Monday
    expect(templateFor('journal', at(2026, 8, 26))?.prompt?.theme).toBe('Character / ethics'); // Wednesday
    expect(templateFor('journal', at(2026, 8, 29))?.prompt?.theme).toBe('Curiosity');        // Saturday
  });

  it('leaves Sunday free-form, because the Weekly review habit owns that reflection', () => {
    expect(templateFor('journal', at(2026, 8, 30))?.prompt?.theme).toBe('Free write');
    expect(JOURNAL_THEMES[0].questions[0]).toMatch(/Weekly review/);
  });

  it('returns null for a habit with no template', () => {
    expect(templateFor(null)).toBeNull();
    expect(templateFor(undefined)).toBeNull();
  });

  it('degrades to the plain composer for an unknown id from a stale cached row', () => {
    expect(templateFor('not-a-template')).toBeNull();
  });

  it('gives the life review a rating per area plus the seven questions', () => {
    const fields = templateFor('life-review')!.fields;
    expect(fields.filter((f) => f.type === 'scale')).toHaveLength(LIFE_AREAS.length);
    expect(fields.filter((f) => f.type === 'text')).toHaveLength(7);
    expect(fields.every((f) => f.type !== 'scale' || (f.min === 0 && f.max === 10))).toBe(true);
  });

  it('scores courage discomfort 1-5 on both sides so the gap is comparable', () => {
    const fields = templateFor('courage')!.fields;
    const scales = fields.filter((f) => f.type === 'scale');
    expect(scales.map((f) => f.id)).toEqual(['anticipated', 'actual']);
    expect(scales.every((f) => f.min === 1 && f.max === 5)).toBe(true);
    expect(templateFor('courage')!.ideas?.map((g) => g.heading)).toEqual(['Social', 'Non-social']);
  });
});
