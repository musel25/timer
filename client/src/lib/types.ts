export type AccentName = 'teal' | 'blue' | 'green' | 'violet' | 'rose' | 'amber';
export type ThemeName = 'night' | 'day';

export interface Settings {
  theme: ThemeName;
  accent: AccentName;
  sound: boolean;
  voice: boolean;
  beeps: boolean;
  keepAwake: boolean;
  volume: number; // master output level, percent (0–200); 100 is the default
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
  prepSeconds?: number; // "Get Ready" countdown before the first focus block; 0/undefined = none
}

export interface HabitGroup {
  id: string;
  name: string;
  emoji: string | null;
  weekdaysOnly: boolean;
  sortOrder: number;
}

export type TimerType = 'simple' | 'interval';
/** Types storable as presets in the timers table. */
export type PresetType = TimerType | 'pomodoro';

/** 'time' habits are run/logged in minutes; 'abstain' habits are an end-of-day
 *  "I stayed off it" check whose streak counts consecutive clean days. */
export type HabitKind = 'time' | 'abstain';

export interface Habit {
  id: string;
  groupId: string | null;
  name: string;
  emoji: string | null;
  note: string | null;
  kind: HabitKind;
  durations: number[]; // minutes
  defaultDurationMin: number | null;
  dailyGoalMin: number | null;
  weekendGoalMin: number | null; // lighter Sat/Sun goal; null = same as dailyGoalMin
  vacationGoalMin: number | null; // lighter goal on vacation days; null = weekend then daily
  sortOrder: number;
  archived: boolean;
  hiddenOn: string | null; // 'YYYY-MM-DD' the habit was hidden from Today, or null
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
  type: PresetType;
  config: SimpleConfig | IntervalConfig | PomodoroConfig;
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
  /** 'habit' (default) or 'focus' for a focus-session umbrella. */
  category?: 'habit' | 'focus';
  /** Focus session id this run was logged inside of, when started during one. */
  parentSessionId?: string | null;
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

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  date: string | null; // 'YYYY-MM-DD' local date, or null = Inbox (undated)
  done: boolean;
  completedAt: number | null;
  hiddenOn: string | null; // 'YYYY-MM-DD' the task was hidden from Today, or null
  sortOrder: number;
  attachmentCount?: number;
  createdAt: number;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO datetime, or 'YYYY-MM-DD' when allDay
  end: string;   // exclusive for all-day events
  allDay: boolean;
}

/** A whole day excused from every habit's streak (a "rest day" / skip). */
export interface RestDay {
  id: string;
  date: string; // 'YYYY-MM-DD' local date that bridges streaks instead of breaking them
  createdAt: number;
}

/** A whole day with a lighter per-habit goal that still must be met to keep a streak. */
export interface VacationDay {
  id: string;
  date: string; // 'YYYY-MM-DD' local date
  createdAt: number;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  mime: string;
  width: number | null;
  height: number | null;
  createdAt: number;
}
