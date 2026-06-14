import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, EyeOff, Flame, ListPlus, Pencil, Play, ShieldCheck } from 'lucide-react';
import type { Habit } from '../../lib/types';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { GoalBar } from '../../components/GoalBar';

/**
 * A habit as a colorful card. Time habits show a single Start button for the
 * default duration (a caret reveals the other lengths on demand) plus today's
 * progress toward the daily goal (minutes).
 * Abstinence habits ('abstain' kind) instead show an end-of-day "stayed off
 * today" toggle and a clean-day streak. Shared by the Today dashboard and the
 * Habits page. Pass `onHide` for the Today hide-for-today control, `editTo` for
 * an edit link, `onLog` for manual time logging, and the abstain trio
 * (`markedToday`, `streak`, `onToggle`) for abstinence habits.
 */
export function HabitCard({
  habit,
  minutesToday,
  onStart,
  onLog,
  onHide,
  editTo,
  markedToday = false,
  streak = 0,
  onToggle,
}: {
  habit: Habit;
  minutesToday: number;
  onStart: (h: Habit, min: number) => void;
  onLog?: (h: Habit, min: number) => void;
  onHide?: (h: Habit) => void;
  editTo?: string;
  markedToday?: boolean;
  streak?: number;
  onToggle?: (h: Habit) => void;
}) {
  const color = categoryColor(habit.id);
  const goal = habit.dailyGoalMin && habit.dailyGoalMin > 0 ? habit.dailyGoalMin : null;
  const durations = habit.durations?.length ? habit.durations : [10];
  const defaultMin = habit.defaultDurationMin ?? durations[0];
  const [logging, setLogging] = useState(false);
  const [pickLength, setPickLength] = useState(false);
  const [customMin, setCustomMin] = useState(String(defaultMin));

  function log(min: number) {
    if (!onLog || !Number.isFinite(min) || min <= 0) return;
    onLog(habit, min);
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
      {onLog && habit.kind !== 'abstain' && (
        <button
          aria-label="Log time"
          title="Log time without a timer"
          onClick={() => setLogging((v) => !v)}
          className={`shrink-0 transition hover:text-slate-200 ${logging ? 'text-slate-200' : 'text-slate-500'}`}
        >
          <ListPlus size={16} />
        </button>
      )}
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
      <div className="flex gap-1.5">
        <button
          onClick={() => onStart(habit, defaultMin)}
          className="chip flex-1 justify-center gap-1.5 py-2 font-medium"
          style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
        >
          <Play size={13} fill="currentColor" /> Start · {defaultMin} min
        </button>
        {durations.length > 1 && (
          <button
            onClick={() => setPickLength((v) => !v)}
            aria-label="Choose a different length"
            aria-expanded={pickLength}
            className="chip shrink-0 justify-center px-2.5 py-2"
            style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
          >
            <ChevronDown size={15} className={`transition ${pickLength ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {pickLength && durations.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {durations.map((min) => (
            <button
              key={min}
              onClick={() => {
                onStart(habit, min);
                setPickLength(false);
              }}
              className="chip flex-1 justify-center gap-1 py-1.5 text-sm font-medium"
              style={{
                borderColor: tint(color.rgb, min === defaultMin ? 0.6 : 0.3),
                backgroundColor: tint(color.rgb, min === defaultMin ? 0.18 : 0.06),
                color: solid(color.rgb),
              }}
            >
              {min === defaultMin && <Play size={11} fill="currentColor" />} {min}m
            </button>
          ))}
        </div>
      )}
      {onLog && logging && (
        <div className="mt-2 rounded-xl border border-ink-600/60 bg-ink-900/40 p-2">
          <div className="mb-1.5 text-xs text-slate-400">Log without a timer</div>
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
    </div>
  );
}
