import type { IntervalConfig, Phase, PomodoroConfig, RunSpec, SimpleConfig } from '../lib/types';

export const PHASE_COLORS = {
  prep: '#f59e0b',
  work: '#22c55e',
  rest: '#3b82f6',
  cooldown: '#8b5cf6',
  finish: '#14b8a6',
} as const;

/** Expand a run spec into the flat list of phases the engine walks through. */
export function buildPhases(spec: RunSpec): Phase[] {
  const phases: Phase[] = [];
  const prep = (spec.config as { prepSeconds?: number }).prepSeconds ?? 0;
  if (prep > 0) phases.push({ kind: 'prep', label: 'Get Ready', seconds: prep, color: PHASE_COLORS.prep });

  if (spec.type === 'simple') {
    const c = spec.config as SimpleConfig;
    phases.push({ kind: 'work', label: spec.label || 'Focus', seconds: c.totalSeconds, color: PHASE_COLORS.work });
  } else {
    const c = spec.config as IntervalConfig;
    const sets = Math.max(1, c.sets);
    for (let s = 1; s <= sets; s++) {
      for (const iv of c.intervals) {
        phases.push({
          kind: iv.kind,
          label: iv.label,
          seconds: iv.seconds,
          color: iv.color || (iv.kind === 'work' ? PHASE_COLORS.work : PHASE_COLORS.rest),
          setIndex: s,
          setCount: sets,
        });
      }
    }
    if (c.cooldownSeconds > 0)
      phases.push({ kind: 'cooldown', label: 'Cooldown', seconds: c.cooldownSeconds, color: PHASE_COLORS.cooldown });
  }

  phases.push({ kind: 'finish', label: 'Done', seconds: 0, color: PHASE_COLORS.finish });
  return phases;
}

/** Total runnable length (excludes the zero-length finish marker). */
export function totalSeconds(phases: Phase[]): number {
  return phases.reduce((a, p) => a + (p.kind === 'finish' ? 0 : p.seconds), 0);
}

/** Sum of work-phase seconds (Pomodoro focus time). */
export function workSeconds(phases: Phase[]): number {
  return phases.reduce((a, p) => a + (p.kind === 'work' ? p.seconds : 0), 0);
}

/**
 * Pomodoro phase list: rounds of work separated by short breaks, with a long
 * break after every `longEvery` pomodoros. No trailing break after the last work.
 */
export function buildPomodoroPhases(cfg: PomodoroConfig, taskLabel: string, prepSeconds = 0): Phase[] {
  const phases: Phase[] = [];
  const rounds = Math.max(1, cfg.rounds);
  if (prepSeconds > 0) phases.push({ kind: 'prep', label: 'Get Ready', seconds: prepSeconds, color: PHASE_COLORS.prep });
  for (let i = 1; i <= rounds; i++) {
    phases.push({
      kind: 'work',
      label: taskLabel || 'Focus',
      seconds: Math.round(cfg.work * 60),
      color: PHASE_COLORS.work,
      setIndex: i,
      setCount: rounds,
    });
    if (i < rounds) {
      const isLong = i % Math.max(1, cfg.longEvery) === 0;
      phases.push(
        isLong
          ? { kind: 'cooldown', label: 'Long break', seconds: Math.round(cfg.long * 60), color: PHASE_COLORS.cooldown }
          : { kind: 'rest', label: 'Short break', seconds: Math.round(cfg.short * 60), color: PHASE_COLORS.rest },
      );
    }
  }
  phases.push({ kind: 'finish', label: 'Done', seconds: 0, color: PHASE_COLORS.finish });
  return phases;
}
