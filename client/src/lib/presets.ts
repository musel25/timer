import type { IntervalConfig, Phase, PhaseKind, PomodoroConfig, RunSpec, SimpleConfig, TimerPreset } from './types';
import { buildPhases, buildPomodoroPhases, totalSeconds, workSeconds } from '../engine/buildPhases';
import { minutes } from './time';

/** Default "Get Ready" countdown for a focus block when the preset predates the
 *  prepSeconds field — so every focus block starts with a countdown like the
 *  interval timers do. An explicit 0 in the config disables it. */
export const DEFAULT_POMODORO_PREP = 5;
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

/** One stripe of a saved timer's bar: a phase, sized by how much of the block it takes. */
export interface BlockSegment {
  kind: PhaseKind;
  seconds: number;
  color: string;
}

/** Everything the saved-timer card shows: how long the block runs, how much of
 *  that is focus, the stripes, and the shape said in words. */
export interface BlockShape {
  totalSeconds: number;
  focusSeconds: number;
  lines: string[];
  segments: BlockSegment[];
}

/** The phases a preset actually runs, so the card can never describe a block
 *  differently from the way the engine plays it. */
function presetPhases(p: TimerPreset): Phase[] {
  if (p.type === 'pomodoro') {
    const cfg = p.config as PomodoroConfig;
    return buildPomodoroPhases(cfg, '', pomodoroPrep(cfg));
  }
  return buildPhases({
    type: p.type,
    config: p.config as SimpleConfig | IntervalConfig,
    label: p.name,
    plannedSeconds: 0,
  });
}

/** A span at the scale it was written: seconds stay seconds, whole minutes read as minutes. */
function shortSpan(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return seconds % 60 === 0 ? `${minutes(seconds)} min` : `${minutes(seconds)} min ${seconds % 60}s`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Say a block's shape in plain words — "4 focus sets of 25 min" answers what
 *  "× 4" left open: a set of *what length*. */
function blockLines(p: TimerPreset): string[] {
  if (p.type === 'pomodoro') {
    const c = p.config as PomodoroConfig;
    const rounds = Math.max(1, c.rounds);
    const lines = [`${plural(rounds, 'focus set')} of ${c.work} min`];
    if (rounds > 1) lines.push(`${c.short} min break between`);
    // Only when a long break actually falls inside this block — with 4 rounds
    // every 4, the long one would land after the last set, so it never runs.
    const every = Math.max(1, c.longEvery);
    if (rounds > every) lines.push(`${c.long} min long break every ${every}`);
    return lines;
  }
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return [`One ${shortSpan(c.totalSeconds)} stretch`];
  }
  const c = p.config as IntervalConfig;
  const work = c.intervals.find((i) => i.kind === 'work');
  const rest = c.intervals.find((i) => i.kind === 'rest');
  const lines = [
    `${plural(Math.max(1, c.sets), 'set')} of ${shortSpan(work?.seconds ?? 0)} work / ${shortSpan(rest?.seconds ?? 0)} rest`,
  ];
  if (c.cooldownSeconds > 0) lines.push(`${shortSpan(c.cooldownSeconds)} cooldown at the end`);
  return lines;
}

export function describeBlock(p: TimerPreset): BlockShape {
  const phases = presetPhases(p);
  return {
    totalSeconds: presetSeconds(p),
    focusSeconds: workSeconds(phases),
    lines: blockLines(p),
    // The prep countdown and the zero-length finish marker are not worth a
    // stripe — a 5s sliver would only be noise next to 25-minute blocks.
    segments: phases
      .filter((ph) => ph.kind !== 'prep' && ph.kind !== 'finish' && ph.seconds > 0)
      .map((ph) => ({ kind: ph.kind, seconds: ph.seconds, color: ph.color })),
  };
}
