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

/** Everything the saved-timer card shows. `sets` and `setLabel` are the
 *  headline — how many goes, and how long one go is. The total is real but
 *  secondary: it is arithmetic on those two, not the thing you decide by. */
export interface BlockShape {
  sets: number;
  setLabel: string;
  detail: string[];
  totalSeconds: number;
  focusSeconds: number;
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

/** The headline pair — how many sets, and how long one is — plus whatever else
 *  is worth a line under it. "× 4" alone never said a set of *what length*. */
function blockShape(p: TimerPreset): Pick<BlockShape, 'sets' | 'setLabel' | 'detail'> {
  if (p.type === 'pomodoro') {
    const c = p.config as PomodoroConfig;
    const sets = Math.max(1, c.rounds);
    const detail: string[] = [];
    if (sets > 1) detail.push(`${c.short} min break between`);
    // Only when a long break actually falls inside this block — with 4 rounds
    // every 4, the long one would land after the last set, so it never runs.
    const every = Math.max(1, c.longEvery);
    if (sets > every) detail.push(`${c.long} min long break every ${every}`);
    return { sets, setLabel: `${c.work} min`, detail };
  }
  if (p.type === 'simple') {
    const c = p.config as SimpleConfig;
    return { sets: 1, setLabel: shortSpan(c.totalSeconds), detail: [] };
  }
  const c = p.config as IntervalConfig;
  const sets = Math.max(1, c.sets);
  const work = c.intervals.find((i) => i.kind === 'work');
  const rest = c.intervals.find((i) => i.kind === 'rest');
  const detail: string[] = [];
  if (rest && rest.seconds > 0 && sets > 1) detail.push(`${shortSpan(rest.seconds)} rest between`);
  if (c.cooldownSeconds > 0) detail.push(`${shortSpan(c.cooldownSeconds)} cooldown at the end`);
  return { sets, setLabel: shortSpan(work?.seconds ?? 0), detail };
}

export function describeBlock(p: TimerPreset): BlockShape {
  const phases = presetPhases(p);
  return {
    ...blockShape(p),
    totalSeconds: presetSeconds(p),
    focusSeconds: workSeconds(phases),
    // The prep countdown and the zero-length finish marker are not worth a
    // stripe — a 5s sliver would only be noise next to 25-minute blocks.
    segments: phases
      .filter((ph) => ph.kind !== 'prep' && ph.kind !== 'finish' && ph.seconds > 0)
      .map((ph) => ({ kind: ph.kind, seconds: ph.seconds, color: ph.color })),
  };
}
