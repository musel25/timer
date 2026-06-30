import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, EyeOff, Flame, MoreHorizontal, Pencil, Plus, ShieldCheck } from 'lucide-react';
import type { Habit } from '../../lib/types';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { GoalBar } from '../../components/GoalBar';

/** What a successful manual log carries: the minutes plus an optional note and
 *  the day it counts toward (today, or back-dated to yesterday). */
export interface LogEntry {
  minutes: number;
  note: string | null;
  /** End-of-window timestamp; the day this `endedAt` falls in receives the time. */
  endedAt: number;
}

/**
 * A habit as a colorful card. Habits are never timed — they are *logged by hand*.
 * A time habit ('time' kind) opens a small composer (minutes + optional note +
 * today/yesterday) and shows today's progress toward the daily goal. An
 * abstinence habit ('abstain' kind) instead shows an end-of-day "stayed off
 * today" toggle and a clean-day streak.
 *
 * Props: `onLog` commits a {@link LogEntry} for a time habit; the abstain trio
 * (`markedToday`, `streak`, `onToggle`) drives the avoid-habit check; `onHide`
 * is the Today hide control; `editTo` links to the editor and `detailTo` to the
 * drill-down; `goalMin` is the effective goal for today.
 */
export function HabitCard({
  habit,
  minutesToday,
  onLog,
  onHide,
  editTo,
  detailTo,
  markedToday = false,
  streak = 0,
  goalMin,
  onToggle,
}: {
  habit: Habit;
  minutesToday: number;
  onLog?: (h: Habit, entry: LogEntry) => void;
  onHide?: (h: Habit) => void;
  editTo?: string;
  detailTo?: string;
  markedToday?: boolean;
  streak?: number;
  goalMin?: number | null; // effective goal for today; falls back to habit.dailyGoalMin
  onToggle?: (h: Habit) => void;
}) {
  const color = categoryColor(habit.id);
  const rawGoal = goalMin !== undefined ? goalMin : habit.dailyGoalMin;
  const goal = rawGoal && rawGoal > 0 ? rawGoal : null;
  const fallbackMin = habit.durations?.length ? habit.durations[0] : 10;
  const defaultMin = habit.defaultDurationMin ?? fallbackMin;

  const [logging, setLogging] = useState(false);
  const [minutes, setMinutes] = useState(defaultMin);

  function openLog() {
    setLogging((v) => {
      const next = !v;
      if (next) setMinutes(defaultMin); // fresh number box each open
      return next;
    });
  }

  function commit() {
    if (!onLog || !Number.isFinite(minutes) || minutes <= 0) return;
    onLog(habit, { minutes, note: null, endedAt: Date.now() });
    setLogging(false);
  }

  // One-tap: log the default amount for today, no composer, no note.
  function logDefault() {
    if (!onLog || !(defaultMin > 0)) return;
    onLog(habit, { minutes: defaultMin, note: null, endedAt: Date.now() });
    setLogging(false);
  }

  const title = detailTo ? (
    <Link to={detailTo} className="block truncate font-semibold transition hover:text-accent" title="Open habit details">{habit.name}</Link>
  ) : (
    <div className="truncate font-semibold">{habit.name}</div>
  );

  const header = (
    <div className="mb-3 flex items-center gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundImage: gradient(color.rgb), boxShadow: `0 6px 14px ${tint(color.rgb, 0.4)}` }}
      >
        <HabitIcon name={habit.emoji} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        {title}
        {habit.note && <div className="truncate text-xs text-slate-400">{habit.note}</div>}
      </div>
      {editTo && (
        <Link to={editTo} className="shrink-0 text-slate-500 opacity-0 transition hover:text-slate-200 group-hover:opacity-100" title="Edit">
          <Pencil size={15} />
        </Link>
      )}
      {onHide && (
        <button
          aria-label="Hide from today"
          title="Hide from today"
          onClick={() => onHide(habit)}
          className="shrink-0 text-slate-500 opacity-0 transition hover:text-slate-200 group-hover:opacity-100"
        >
          <EyeOff size={16} />
        </button>
      )}
    </div>
  );

  // Abstinence habit: one end-of-day toggle + clean-day streak, nothing to log.
  if (habit.kind === 'abstain') {
    return (
      <div className="card group relative overflow-hidden p-4">
        <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: gradient(color.rgb) }} />
        {header}
        <button
          onClick={() => onToggle?.(habit)}
          className="chip w-full justify-center gap-1.5 py-2 font-medium"
          style={
            markedToday
              ? { borderColor: solid(color.rgb), backgroundImage: gradient(color.rgb, 0.9, 0.6), color: '#fff' }
              : { borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.08), color: solid(color.rgb) }
          }
        >
          {markedToday ? <Check size={14} /> : <ShieldCheck size={14} />}
          {markedToday ? 'Stayed off today' : 'Mark stayed off'}
        </button>
        <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
          <Flame size={13} className={streak > 0 ? 'text-amber-500' : ''} />
          {streak > 0 ? `${streak}-day clean streak` : 'Start a clean streak'}
        </div>
      </div>
    );
  }

  return (
    <div className="card group relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: gradient(color.rgb) }} />
      {header}

      {onLog && (
        <div className="flex gap-1.5">
          <button
            onClick={logDefault}
            aria-label={`Log ${defaultMin} minutes`}
            className="chip flex-1 justify-center gap-1.5 py-2 font-medium"
            style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
          >
            <Plus size={14} /> Log {defaultMin} min
          </button>
          <button
            onClick={openLog}
            aria-label="Custom log"
            aria-expanded={logging}
            title="Log a specific amount"
            className="chip shrink-0 justify-center px-3 py-2"
            style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}

      {onLog && logging && (
        <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-ink-600/60 bg-ink-900/40 p-2.5">
          {/* just a number box for a specific amount */}
          <input
            type="number"
            min={1}
            inputMode="numeric"
            autoFocus
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            aria-label="Minutes"
            className="input w-20 py-1.5 text-center text-sm"
          />
          <span className="text-xs text-slate-400">min</span>
          <button
            onClick={commit}
            disabled={!(minutes > 0)}
            className="chip ml-auto justify-center gap-1 px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ borderColor: tint(color.rgb, 0.6), backgroundColor: tint(color.rgb, 0.18), color: solid(color.rgb) }}
          >
            <Check size={13} /> Log
          </button>
        </div>
      )}

      {goal ? (
        <div className="mt-3">
          <GoalBar done={minutesToday} goal={goal} rgb={color.rgb} />
        </div>
      ) : minutesToday > 0 ? (
        <div className="mt-3 text-xs text-slate-400">{Math.round(minutesToday)} min today</div>
      ) : null}
      <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
        <Flame size={13} className={streak > 0 ? 'text-amber-500' : ''} />
        {streak > 0 ? `${streak}-day streak` : 'Start a streak'}
      </div>
    </div>
  );
}
