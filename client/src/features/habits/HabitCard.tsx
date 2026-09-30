import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, EyeOff, Flame, MoreHorizontal, Pencil, Plus, ShieldCheck, SquarePen, Undo2 } from 'lucide-react';
import type { Habit } from '../../lib/types';
import { HabitIcon } from '../../lib/habitIcons';
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
 * The minutes a time habit's "done" logs: the goal today actually asks for
 * (weekend/vacation aware). A vacation goal of 0 means the habit takes the day
 * off, which leaves no goal - fall back to the daily goal so logging still works
 * if you feel like doing it anyway. `goalMin` undefined means "use the daily goal".
 */
export function goalLogAmount(habit: Habit, goalMin?: number | null): number {
  const today = goalMin !== undefined ? goalMin : habit.dailyGoalMin;
  if (today && today > 0) return today;
  if (habit.dailyGoalMin && habit.dailyGoalMin > 0) return habit.dailyGoalMin;
  return habit.defaultDurationMin ?? habit.durations?.[0] ?? 10;
}

/**
 * A habit with its daily progress and logging actions. Habits are never timed — they are *logged by hand*.
 * A time habit ('time' kind) opens a small composer (minutes + optional note +
 * today/yesterday) and shows today's progress toward the daily goal. An
 * abstinence habit ('abstain' kind) instead shows an end-of-day "stayed off
 * today" toggle and a clean-day streak.
 *
 * A 'check' habit ('did I do it at all?' — a courageous act, a monthly review)
 * shows one button that opens its entry form.
 *
 * Props: `onLog` commits a {@link LogEntry} for a time habit; the abstain trio
 * (`markedToday`, `streak`, `onToggle`) drives the avoid-habit check; `onHide`
 * is the Today hide control; `editTo` links to the editor and `detailTo` to the
 * drill-down; `goalMin` is the effective goal for today. `onOpenEntry` opens the
 * structured composer (a habit with a template) and `streakUnit` names what the
 * streak counts.
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
  onOpenEntry,
  streakUnit = 'day',
  saving = false,
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
  onOpenEntry?: (h: Habit) => void;
  streakUnit?: 'day' | 'week' | 'month';
  saving?: boolean;
}) {

  const rawGoal = goalMin !== undefined ? goalMin : habit.dailyGoalMin;
  const goal = rawGoal && rawGoal > 0 ? rawGoal : null;
  // One tap (and the composer's check) logs what today actually asks for.
  const logAmount = goalLogAmount(habit, goalMin);

  const [logging, setLogging] = useState(false);
  const [minutes, setMinutes] = useState(logAmount);

  function openLog() {
    setLogging((v) => {
      const next = !v;
      if (next) setMinutes(logAmount); // fresh number box each open
      return next;
    });
  }

  function commit() {
    if (!onLog || !Number.isFinite(minutes) || minutes <= 0) return;
    onLog(habit, { minutes, note: null, endedAt: Date.now() });
    setLogging(false);
  }

  // One tap (or the composer's check): log today's goal, no note.
  function logDefault() {
    if (!onLog || !(logAmount > 0)) return;
    onLog(habit, { minutes: logAmount, note: null, endedAt: Date.now() });
    setLogging(false);
  }

  const title = detailTo ? (
    <Link to={detailTo} className="block truncate font-semibold transition hover:text-accent" title="Open habit details">{habit.name}</Link>
  ) : (
    <div className="truncate font-semibold">{habit.name}</div>
  );

  const progress = (
    <div className="habit-progress space-y-2 text-xs text-slate-400">
      {habit.kind === 'time' && (goal
        ? <GoalBar done={minutesToday} goal={goal} rgb="var(--accent-text)" />
        : <span>{Math.round(minutesToday)} min logged today</span>)}
      {habit.kind !== 'time' && <span>{markedToday ? 'Completed today' : 'Not yet completed'}</span>}
      {streak > 0 && <div className="flex items-center gap-1"><Flame size={12} />{streak} {streakUnit}{streak === 1 ? '' : 's'} in a row</div>}
    </div>
  );

  return (
    <div className="habit-row">
      <div className="habit-identity flex min-w-0 items-center gap-3">
        <span className="habit-symbol"><HabitIcon name={habit.emoji || 'sprout'} size={21} /></span>
        <div className="min-w-0 flex-1">{title}{habit.note && <div className="mt-1 truncate text-xs text-slate-400">{habit.note}</div>}</div>
        {editTo && <Link to={editTo} className="rounded p-1 text-slate-500 hover:text-slate-200" aria-label={`Edit ${habit.name}`} title="Edit habit"><Pencil size={14} /></Link>}
        {onHide && <button aria-label="Hide from today" onClick={() => onHide(habit)} className="rounded p-1 text-slate-500"><EyeOff size={15} /></button>}
      </div>
      {progress}
      <div className="habit-actions flex items-center justify-end gap-1.5">
        {habit.kind === 'check' ? (
          <button disabled={saving} onClick={() => markedToday ? onToggle?.(habit) : onOpenEntry?.(habit)} className={markedToday ? 'btn-outline py-2' : 'btn-accent py-2'}>{markedToday ? <Undo2 size={14} /> : <SquarePen size={14} />}{markedToday ? 'Undo' : 'Log entry'}</button>
        ) : habit.kind === 'abstain' ? (
          <button disabled={saving} onClick={() => onToggle?.(habit)} className={markedToday ? 'btn-outline py-2' : 'btn-accent py-2'}>{markedToday ? <Check size={14} /> : <ShieldCheck size={14} />}{markedToday ? 'Stayed off today' : 'Mark stayed off'}</button>
        ) : onLog ? <>
          <button disabled={saving} onClick={logDefault} aria-label={`Log ${logAmount} minutes`} className="habit-log-btn btn whitespace-nowrap px-3 py-2"><Plus size={14} />Log {logAmount} min</button>
          <button disabled={saving} onClick={() => onOpenEntry ? onOpenEntry(habit) : openLog()} aria-label={onOpenEntry ? 'Open entry form' : 'Custom log'} aria-expanded={onOpenEntry ? undefined : logging} title={onOpenEntry ? 'Open entry form' : 'Log a specific amount'} className="btn-outline px-2.5 py-2.5">{onOpenEntry ? <SquarePen size={15} /> : <MoreHorizontal size={15} />}</button>
        </> : null}
      </div>
      {habit.kind === 'time' && onLog && !onOpenEntry && logging && <div className="habit-composer flex flex-wrap items-center gap-2 rounded-lg bg-ink-700 p-3">
        <button onClick={logDefault} disabled={saving} aria-label={`Done, log ${logAmount} minutes`} className="btn-accent py-2"><Check size={13} />Done · {logAmount} min</button>
        <span className="text-xs text-slate-500">or</span>
        <input id={`minutes-${habit.id}`} aria-label="Minutes" type="number" min={1} inputMode="numeric" autoFocus value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && commit()} className="input w-20 py-1.5 text-center text-sm" />
        <span className="text-xs text-slate-400">min</span>
        <button onClick={commit} disabled={saving || !(minutes > 0)} className="btn-outline py-2">Log</button>
        <button onClick={() => setLogging(false)} className="btn-ghost ml-auto py-2">Cancel</button>
      </div>}
    </div>
  );
}
