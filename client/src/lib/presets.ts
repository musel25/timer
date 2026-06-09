import type { IntervalConfig, RunSpec, SimpleConfig, TimerPreset } from './types';

export function presetSeconds(p: TimerPreset): number {
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return (c.prepSeconds ?? 0) + c.totalSeconds;
  }
  const c = p.config as IntervalConfig;
  const perSet = c.intervals.reduce((a, iv) => a + iv.seconds, 0);
  return (c.prepSeconds ?? 0) + c.sets * perSet + (c.cooldownSeconds ?? 0);
}

export function runSpecFromPreset(p: TimerPreset): RunSpec {
  return {
    type: p.type,
    config: p.config,
    label: p.name,
    timerId: p.id,
    plannedSeconds: presetSeconds(p),
  };
}

export function describePreset(p: TimerPreset): string {
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return `${Math.round(c.totalSeconds / 60)} min focus`;
  }
  const c = p.config as IntervalConfig;
  const work = c.intervals.find((i) => i.kind === 'work');
  const rest = c.intervals.find((i) => i.kind === 'rest');
  return `${c.sets} × (${work?.seconds ?? 0}s / ${rest?.seconds ?? 0}s)`;
}
