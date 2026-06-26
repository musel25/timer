import type { IntervalConfig, PomodoroConfig, RunSpec, SimpleConfig, TimerPreset } from './types';
import { buildPomodoroPhases, totalSeconds, workSeconds } from '../engine/buildPhases';

/** Default "Get Ready" countdown for a focus block when the preset predates the
 *  prepSeconds field — so every focus block starts with a countdown like the
 *  interval timers do. An explicit 0 in the config disables it. */
export const DEFAULT_POMODORO_PREP = 10;
const pomodoroPrep = (cfg: PomodoroConfig): number => cfg.prepSeconds ?? DEFAULT_POMODORO_PREP;

export function presetSeconds(p: TimerPreset): number {
  if (p.type === 'pomodoro') {
    const cfg = p.config as PomodoroConfig;
    return totalSeconds(buildPomodoroPhases(cfg, '', pomodoroPrep(cfg)));
  }
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return (c.prepSeconds ?? 0) + c.totalSeconds;
  }
  const c = p.config as IntervalConfig;
  const perSet = c.intervals.reduce((a, iv) => a + iv.seconds, 0);
  return (c.prepSeconds ?? 0) + c.sets * perSet + (c.cooldownSeconds ?? 0);
}

export function runSpecFromPreset(p: TimerPreset): RunSpec {
  if (p.type === 'pomodoro') {
    const cfg = p.config as PomodoroConfig;
    const prep = pomodoroPrep(cfg);
    const phases = buildPomodoroPhases(cfg, '', prep);
    return {
      type: 'interval',
      config: { prepSeconds: prep, sets: cfg.rounds, intervals: [], cooldownSeconds: 0 },
      label: p.name,
      timerId: p.id,
      plannedSeconds: workSeconds(phases),
      phases,
      trackMode: 'focus',
    };
  }
  return {
    type: p.type,
    config: p.config as SimpleConfig | IntervalConfig,
    label: p.name,
    timerId: p.id,
    plannedSeconds: presetSeconds(p),
  };
}

export function describePreset(p: TimerPreset): string {
  if (p.type === 'pomodoro') {
    const c = p.config as PomodoroConfig;
    return `${c.rounds} × ${c.work}m / ${c.short}m`;
  }
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return `${Math.round(c.totalSeconds / 60)} min`;
  }
  const c = p.config as IntervalConfig;
  const work = c.intervals.find((i) => i.kind === 'work');
  const rest = c.intervals.find((i) => i.kind === 'rest');
  return `${c.sets} × (${work?.seconds ?? 0}s / ${rest?.seconds ?? 0}s)`;
}
