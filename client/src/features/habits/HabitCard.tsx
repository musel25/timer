import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, EyeOff, Flame, Pencil, Plus, ShieldCheck } from 'lucide-react';
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A habit as a colorful card. Habits are never timed — they are *logged by hand*.
 * A time habit ('time' kind) opens a small composer (minutes + optional note +
 * today/yesterday) and shows today's progress toward the daily goal. An
 * abstinence habit ('abstain' kind) instead shows an end-of-day "stayed off
 * today" toggle and a clean-day streak.
 *
 * Props: `onLog` commits a {@link LogEntry} for a time habit; the abstain trio
 * (`markedToday`, `streak`, `onToggle`) drives the avoid-habit check; `onHide`
 * is the Today hide control; `editTo` links to the editor; `goalMin` is the
 * effective goal for today (falls back to `habit.dailyGoalMin`).
 */
export function HabitCard({
  habit,
  minutesToday,
  onLog,
  onHide,
  editTo,
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
  markedToday?: boolean;
  streak?: number;
  goalMin?: number | null; // effective goal for today; falls back to habit.dailyGoalMin
  onToggle?: (h: Habit) => void;
}) {
  const color = categoryColor(habit.id);
  const rawGoal = goalMin !== undefined ? goalMin : habit.dailyGoalMin;
  const goal = rawGoal && rawGoal > 0 ? rawGoal : null;
  const durations = habit.durations?.length ? habit.durations : [10];
  const defaultMin = habit.defaultDurationMin ?? durations[0];

  const [logging, setLogging] = useState(false);
  const [minutes, setMinutes] = useState(defaultMin);
  const [note, setNote] = useState('');
  const [yesterday, setYesterday] = useState(false);

  function openLog() {
    setLogging((v) => {
      const next = !v;
      if (next) { setMinutes(defaultMin); setNote(''); setYesterday(false); } // fresh composer each open
      return next;
    });
  }

  function commit() {
    if (!onLog || !Number.isFinite(minutes) || minutes <= 0) return;
    onLog(habit, {
      minutes,
      note: note.trim() || null,
      endedAt: yesterday ? Date.now() - DAY_MS : Date.now(),
    });
    setLogging(false);
  }

  const header = (
    <div className="mb-3 flex items-center gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundImage: gradient(color.rgb), boxShadow: `0 6px 14px ${tint(color.rgb, 0.4)}` }}
      >
        <HabitIcon name={habit.emoji} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{habit.name}</div>
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
        <button
          onClick={openLog}
          aria-label="Log time"
          aria-expanded={logging}
          className="chip w-full justify-center gap-1.5 py-2 font-medium"
          style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
        >
          <Plus size={14} /> Log time
        </button>
      )}

      {onLog && logging && (
        <div className="mt-2 space-y-2 rounded-xl border border-ink-600/60 bg-ink-900/40 p-2.5">
          {/* minutes — quick chips set the amount, or type a custom value */}
          <div>
            <div className="mb-1.5 text-xs text-slate-400">Minutes</div>
            <div className="flex flex-wrap gap-1.5">
              {durations.map((min) => (
                <button
                  key={min}
                  onClick={() => setMinutes(min)}
                  className="chip flex-1 justify-center py-1.5 text-sm font-medium"
                  style={
                    minutes === min
                      ? { borderColor: solid(color.rgb), backgroundColor: tint(color.rgb, 0.18), color: solid(color.rgb) }
                      : { borderColor: tint(color.rgb, 0.25) }
                  }
                >
                  {min}m
                </button>
              ))}
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
                aria-label="Custom minutes"
                className="input w-16 py-1.5 text-center text-sm"
              />
            </div>
          </div>

          {/* what did you do? — optional */}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            placeholder="What did you do? (optional)"
            aria-label="Note"
            className="input w-full py-1.5 text-sm"
          />

          {/* which day — default today, or back-date to yesterday */}
          <div className="flex gap-1.5">
            {([['Today', false], ['Yesterday', true]] as const).map(([label, isYesterday]) => (
              <button
                key={label}
                onClick={() => setYesterday(isYesterday)}
                className={`chip flex-1 justify-center py-1.5 text-sm ${yesterday === isYesterday ? 'chip-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={commit}
            disabled={!(minutes > 0)}
            className="chip w-full justify-center gap-1 py-2 text-sm font-medium disabled:opacity-40"
            style={{ borderColor: tint(color.rgb, 0.6), backgroundColor: tint(color.rgb, 0.18), color: solid(color.rgb) }}
          >
            <Check size={13} /> Log {minutes > 0 ? `${minutes} min` : ''}{yesterday ? ' yesterday' : ''}
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
