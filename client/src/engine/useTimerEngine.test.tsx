import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Phase } from '../lib/types';

vi.mock('./audio', () => ({
  audio: {
    beep: vi.fn(),
    prep: vi.fn(),
    work: vi.fn(),
    rest: vi.fn(),
    cooldown: vi.fn(),
    finish: vi.fn(),
    speak: vi.fn(),
    notify: vi.fn(),
  },
}));

const intervalCbs = new Map<number, () => void>();
const timeoutCbs = new Map<number, () => void>();
let nextId = 1;
vi.mock('./workerTimer', () => ({
  setWorkerTimeout: vi.fn((cb: () => void) => {
    const id = nextId++;
    timeoutCbs.set(id, cb);
    return id;
  }),
  clearWorkerTimeout: vi.fn((id: number) => timeoutCbs.delete(id)),
  setWorkerInterval: vi.fn((cb: () => void) => {
    const id = nextId++;
    intervalCbs.set(id, cb);
    return id;
  }),
  clearWorkerInterval: vi.fn((id: number) => intervalCbs.delete(id)),
}));

import { audio } from './audio';
import { useTimerEngine } from './useTimerEngine';

const phases: Phase[] = [
  { kind: 'prep', label: 'Get ready', seconds: 5 },
  { kind: 'work', label: 'Work', seconds: 10 },
  { kind: 'rest', label: 'Rest', seconds: 10 },
  { kind: 'finish', label: 'Done', seconds: 0 },
] as Phase[];

let now = 0;

beforeEach(() => {
  now = 0;
  nextId = 1;
  intervalCbs.clear();
  timeoutCbs.clear();
  vi.clearAllMocks();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  // Simulate a hidden tab: browsers freeze requestAnimationFrame entirely, so
  // the engine must not depend on it for sounds or phase transitions.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fireWorkerInterval() {
  act(() => {
    for (const cb of [...intervalCbs.values()]) cb();
  });
}

describe('useTimerEngine in a hidden tab (rAF frozen)', () => {
  it('plays phase cues and countdown beeps from the worker interval, without rAF', () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() =>
      useTimerEngine(phases, { beeps: true, voice: false, onFinish }),
    );
    act(() => result.current.start());
    expect(audio.prep).toHaveBeenCalledTimes(1);
    expect(intervalCbs.size).toBe(1); // worker heartbeat armed

    // 6s in: prep (5s) is over → work cue must have fired even though rAF never ran.
    now = 6000;
    fireWorkerInterval();
    expect(audio.work).toHaveBeenCalledTimes(1);
    expect(result.current.phaseIndex).toBe(1);

    // 13s in: 2s left in work → a countdown beep fires.
    now = 13_100;
    fireWorkerInterval();
    expect(audio.beep).toHaveBeenCalled();

    // 16s in: work over → rest cue.
    now = 16_000;
    fireWorkerInterval();
    expect(audio.rest).toHaveBeenCalledTimes(1);

    // 26s in: everything done → finish alarm + callback, heartbeat stops.
    now = 26_000;
    fireWorkerInterval();
    expect(audio.finish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(25, true);
    expect(intervalCbs.size).toBe(0);
  });

  it('stops the worker heartbeat on pause and restarts it on resume', () => {
    const { result } = renderHook(() =>
      useTimerEngine(phases, { beeps: true, voice: false, onFinish: vi.fn() }),
    );
    act(() => result.current.start());
    expect(intervalCbs.size).toBe(1);
    act(() => result.current.pause());
    expect(intervalCbs.size).toBe(0);
    act(() => result.current.resume());
    expect(intervalCbs.size).toBe(1);
  });

  it('the worker finish alarm still fires as a backstop', () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() =>
      useTimerEngine(phases, { beeps: true, voice: false, onFinish }),
    );
    act(() => result.current.start());
    now = 25_000;
    act(() => {
      for (const cb of [...timeoutCbs.values()]) cb();
    });
    expect(audio.finish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(25, true);
    expect(result.current.status).toBe('done');
  });
});
