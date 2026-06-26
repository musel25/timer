import { describe, expect, it } from 'vitest';
import { timerTypeLabel } from './timerMeta';

describe('timerTypeLabel', () => {
  it('labels pomodoro as Focus block', () => {
    expect(timerTypeLabel('pomodoro')).toBe('Focus block');
  });
  it('labels simple as Timer', () => {
    expect(timerTypeLabel('simple')).toBe('Timer');
  });
  it('labels interval as Interval', () => {
    expect(timerTypeLabel('interval')).toBe('Interval');
  });
});
