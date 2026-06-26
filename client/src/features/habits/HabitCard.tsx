import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, EyeOff, Flame, Pencil, Plus, ShieldCheck } from 'lucide-react';
import type { Habit } from '../../lib/types';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { GoalBar } from '../../components/GoalBar';

/**
 * A habit as a colorful card — a tracker + config + log surface (it no longer
 * starts timers; timing lives on the Timer page). Time habits show a primary
 * "Log time" action plus today's progress toward the daily goal (minutes).
 * When a timer/focus block is running, opening the log pre-fills with its
 * uncommitted minutes (`suggestedMin`) and a successful log checkpoints it
 * (`onCheckpoint`, the lap reset). Abstinence habits ('abstain' kind) instead
 * show an end-of-day "stayed off today" toggle and a clean-day streak. Pass
 * `onHide` for the Today hide control, `editTo` for an edit link, `onLog` for
 * logging, and the abstain trio (`markedToday`, `streak`, `onToggle`).
 */
export function HabitCard({
  habit,
  minutesToday,
  onLog,
  suggestedMin,
  onCheckpoint,
  onHide,
  editTo,
  markedToday = false,
  streak = 0,
  goalMin,
  onToggle,
}: {
  habit: Habit;
  minutesToday: number;
  onLog?: (h: Habit, min: number) => void;
  suggestedMin?: () => number;
  onCheckpoint?: () => void;
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
  const [customMin, setCustomMin] = useState(String(defaultMin));

  function openLog() {
    setLogging((v) => {
      const next = !v;
      if (next && suggestedMin) {
        const s = Math.round(suggestedMin());
        if (s > 0) setCustomMin(String(s));
      }
      return next;
    });
  }

  function log(min: number) {
    if (!onLog || !Number.isFinite(min) || min <= 0) return;
    onLog(habit, min);
    onCheckpoint?.();
    setLogging(false);
    setCustomMin(String(defaultMin));
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

  // Abstinence habit: one end-of-day toggle + clean-day streak, no timer.
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
        <div className="mt-2 rounded-xl border border-ink-600/60 bg-ink-900/40 p-2">
          <div className="mb-1.5 text-xs text-slate-400">Log time</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {durations.map((min) => (
              <button
                key={min}
                onClick={() => log(min)}
                className="chip flex-1 justify-center py-1.5 text-sm font-medium"
                style={{ borderColor: tint(color.rgb, 0.3), backgroundColor: tint(color.rgb, 0.06), color: solid(color.rgb) }}
              >
                {min}m
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && log(Number(customMin))}
              aria-label="Minutes"
              className="input w-20 py-1.5 text-sm"
            />
            <button
              onClick={() => log(Number(customMin))}
              className="chip flex-1 justify-center gap-1 py-1.5 text-sm font-medium"
              style={{ borderColor: tint(color.rgb, 0.6), backgroundColor: tint(color.rgb, 0.18), color: solid(color.rgb) }}
            >
              <Check size={13} /> Log {customMin || '0'} min
            </button>
          </div>
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
