import { Link } from 'react-router-dom';
import { EyeOff, Pencil, Play } from 'lucide-react';
import type { Habit } from '../../lib/types';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { goalBlocks } from '../../lib/stats';
import { BlockBar } from '../../components/BlockBar';

/**
 * A habit as a colorful card: category-tinted icon chip, name, one start
 * button per configured duration (default highlighted), and today's block
 * progress. Shared by the Today dashboard and the Habits page. Pass `onHide`
 * for the Today hide-for-today control, or `editTo` for an edit link.
 */
export function HabitCard({
  habit,
  blocksToday,
  onStart,
  onHide,
  editTo,
}: {
  habit: Habit;
  blocksToday: number;
  onStart: (h: Habit, min: number) => void;
  onHide?: (h: Habit) => void;
  editTo?: string;
}) {
  const color = categoryColor(habit.id);
  const goal = goalBlocks(habit.dailyGoalMin);
  const durations = habit.durations?.length ? habit.durations : [10];
  const defaultMin = habit.defaultDurationMin ?? durations[0];
  return (
    <div className="card group relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: gradient(color.rgb) }} />
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
      {durations.length === 1 ? (
        <button
          onClick={() => onStart(habit, durations[0])}
          className="chip w-full justify-center gap-1.5 py-2 font-medium"
          style={{ borderColor: tint(color.rgb, 0.5), backgroundColor: tint(color.rgb, 0.1), color: solid(color.rgb) }}
        >
          <Play size={13} fill="currentColor" /> Start · {durations[0]} min
        </button>
      ) : (
        <div className="flex gap-1.5">
          {durations.map((min) => (
            <button
              key={min}
              onClick={() => onStart(habit, min)}
              className="chip flex-1 justify-center gap-1 py-2 font-medium"
              style={{
                borderColor: tint(color.rgb, min === defaultMin ? 0.6 : 0.3),
                backgroundColor: tint(color.rgb, min === defaultMin ? 0.18 : 0.06),
                color: solid(color.rgb),
              }}
            >
              {min === defaultMin && <Play size={12} fill="currentColor" />} {min}m
            </button>
          ))}
        </div>
      )}
      {goal ? (
        <div className="mt-3">
          <BlockBar done={blocksToday} goal={goal} rgb={color.rgb} />
        </div>
      ) : blocksToday > 0 ? (
        <div className="mt-3 text-xs text-slate-400">
          {blocksToday} block{blocksToday === 1 ? '' : 's'} today
        </div>
      ) : null}
    </div>
  );
}
