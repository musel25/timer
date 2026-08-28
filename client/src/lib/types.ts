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
 *  "I stayed off it" check whose streak counts consecutive clean days; 'check'
 *  habits are simply done or not, with no minutes worth asking for (a courageous
 *  act, a monthly review). */
export type HabitKind = 'time' | 'abstain' | 'check';

/** How often a habit comes round. Daily habits keep the original semantics:
 *  minutes summed against a per-day goal. Weekly/monthly habits instead count
 *  occurrences against {@link Habit.targetCount}. */
export type Cadence = 'daily' | 'weekly' | 'monthly';

/** Which structured form a completion opens. NULL = done + an optional note. */
export type EntryTemplate =
  | 'journal' | 'read' | 'leetcode' | 'courage' | 'weekly-review' | 'life-review' | 'simplify';

/** Answers to a template's fields, keyed by field id. */
export type EntryData = Record<string, string | number>;

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
  /* --- cadence. All four are optional: a response the service worker cached
     before these columns existed must read as a plain daily habit, not crash
     the dashboard (same rule as `isArchived` in features/notes). --- */
  cadence?: Cadence;
  /** Weekly: weekday 0-6 (0 = Sunday). Monthly: day of month 1-28. Daily: null.
   *  A *soft* anchor — it decides when the habit surfaces in Today, not when it
   *  counts; completing it any time in the period satisfies the period. */
  anchor?: number | null;
  /** Occurrences needed per period (Music = 2). Absent = 1. */
  targetCount?: number;
  template?: EntryTemplate | null;
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
  /** Always 'habit' now. 'focus' is legacy: it tagged the old focus-session
   *  "umbrella" (removed) and is still excluded from time totals for old rows. */
  category?: 'habit' | 'focus';
  /** The period this completion counts toward: '2026-08-28' | '2026-W35' |
   *  '2026-08'. Computed on the client — the server does not know the user's
   *  timezone, so it cannot tell which day (let alone week) a write belongs to. */
  periodKey?: string | null;
  /** Answers to the habit template's fields, if it has one. */
  entry?: EntryData | null;
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
  /** When the task was archived out of the Inbox; null while it's still there. */
  archivedAt: number | null;
  sortOrder: number;
  attachmentCount?: number;
  createdAt: number;
}

/** A quick free-form capture (idea, thought, habit tweak). Tags come from
 *  #hashtags typed in the text, lowercased. */
export interface Note {
  id: string;
  text: string;
  tags: string[];
  pinned: boolean;
  /** When the note left the inbox; null while it's still there. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
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

export interface DesktopTask {
  id: string;
  text: string;
  done: boolean;
}

/** One journal entry on a desktop card; newest first in the array. */
export interface DesktopComment {
  id: string;
  text: string;
  at: number;
}

/** One card per Ubuntu virtual desktop, mirroring the user's spatial layout.
 *  The displayed number is index+1 in sortOrder order, so removing a desktop
 *  collapses the numbering exactly like GNOME dynamic workspaces. */
export interface Desktop {
  id: string;
  title: string;
  lane: string | null;
  description: string | null;
  tasks: DesktopTask[];
  comments: DesktopComment[];
  /** At most one per user — the pinned card you are working on. */
  focused: boolean;
  sortOrder: number;
  /** "Done" archives so the journal survives; null while on the board. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
