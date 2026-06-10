import { Link } from 'react-router-dom';
import { Check, EyeOff, Pencil } from 'lucide-react';
import type { Habit } from '../../lib/types';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';

/**
 * A habit as a colorful card: category-tinted icon chip, name, and duration chips
 * whose done state renders in the habit's category color. Shared by the Today
 * dashboard and the Habits page. Pass `onHide` for the Today hide-for-today control,
 * or `editTo` for an edit link.
 */
export function HabitCard({
  habit,
  doneChips,
  onStart,
  onHide,
  editTo,
}: {
  habit: Habit;
  doneChips: Set<string>;
  onStart: (h: Habit, min: number) => void;
  onHide?: (h: Habit) => void;
  editTo?: string;
}) {
  const color = categoryColor(habit.id);
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
      <div className="flex flex-wrap gap-2">
        {habit.durations.map((min) => {
          const done = doneChips.has(`${habit.id}:${min}`);
          return (
            <button
              key={min}
              onClick={() => onStart(habit, min)}
              className="chip gap-1"
              style={done ? { borderColor: solid(color.rgb), backgroundColor: tint(color.rgb, 0.16), color: solid(color.rgb) } : undefined}
            >
              {done && <Check size={13} strokeWidth={3} />}{min}
            </button>
          );
        })}
      </div>
    </div>
  );
}
