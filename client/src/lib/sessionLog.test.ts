import { describe, expect, it } from 'vitest';
import { buildManualSession } from './sessionLog';

describe('buildManualSession', () => {
  const now = 1_700_000_000_000;

  it('records planned and actual seconds equal to minutes x 60', () => {
    const s = buildManualSession('h1', 30, now);
    expect(s.plannedSeconds).toBe(1800);
    expect(s.actualSeconds).toBe(1800);
  });

  it('marks the session completed so it counts toward blocks and streaks', () => {
    expect(buildManualSession('h1', 10, now).completed).toBe(true);
  });

  it('ends at now and starts `minutes` earlier', () => {
    const s = buildManualSession('h1', 120, now);
    expect(s.endedAt).toBe(now);
    expect(s.startedAt).toBe(now - 120 * 60 * 1000);
  });

  it('attaches the habit and leaves it timer-less', () => {
    const s = buildManualSession('habit-42', 5, now);
    expect(s.habitId).toBe('habit-42');
    expect(s.timerId).toBeNull();
    expect(s.type).toBe('simple');
  });
});
