export type AccentName = 'teal' | 'blue' | 'green' | 'violet' | 'rose' | 'amber';

export interface Settings {
  theme: 'dark';
  accent: AccentName;
  sound: boolean;
  voice: boolean;
  beeps: boolean;
  keepAwake: boolean;
  prepSeconds: number; // "get ready" countdown before a focus habit starts
  weekStart: number; // 0=Sun, 1=Mon
  pomodoro: PomodoroConfig;
}

export interface PomodoroConfig {
  work: number; // minutes
  short: number; // minutes
  long: number; // minutes
  longEvery: number; // long break after this many pomodoros
  rounds: number; // pomodoros per session
}

export interface HabitGroup {
  id: string;
  name: string;
  emoji: string | null;
  sortOrder: number;
}

export type TimerType = 'simple' | 'interval';

export interface Habit {
  id: string;
  groupId: string | null;
  name: string;
  emoji: string | null;
  note: string | null;
  durations: number[]; // minutes
  defaultDurationMin: number | null;
  dailyGoalMin: number | null;
  timerType: TimerType;
  defaultTimerId: string | null;
  sortOrder: number;
  archived: boolean;
  createdAt: number;
}

export interface Interval {
  label: string;
  seconds: number;
  kind: 'work' | 'rest';
  color: string;
  sound?: string;
}

export interface SimpleConfig {
  totalSeconds: number;
  prepSeconds: number;
  sounds?: { countdownBeeps?: boolean; voice?: boolean };
}

export interface IntervalConfig {
  prepSeconds: number;
  sets: number;
  intervals: Interval[];
  cooldownSeconds: number;
  sounds?: { countdownBeeps?: boolean; voice?: boolean };
}

export interface TimerPreset {
  id: string;
  name: string;
  type: TimerType;
  config: SimpleConfig | IntervalConfig;
  sortOrder: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  habitId: string | null;
  timerId: string | null;
  label: string | null;
  type: TimerType;
  plannedSeconds: number;
  actualSeconds: number;
  completed: boolean;
  startedAt: number;
  endedAt: number;
  note: string | null;
  createdAt: number;
}

/** A concrete thing to run (resolved from a habit duration, a preset, or quick input). */
export interface RunSpec {
  type: TimerType;
  config: SimpleConfig | IntervalConfig;
  label: string;
  habitId?: string | null;
  timerId?: string | null;
  plannedSeconds: number;
  /** Pre-built phase list (used by Pomodoro); overrides buildPhases when present. */
  phases?: Phase[];
  /** 'focus' logs only completed work time (Pomodoro); 'whole' logs total elapsed. */
  trackMode?: 'whole' | 'focus';
}

export type PhaseKind = 'prep' | 'work' | 'rest' | 'cooldown' | 'finish';

export interface Phase {
  kind: PhaseKind;
  label: string;
  seconds: number;
  color: string;
  setIndex?: number;
  setCount?: number;
}
