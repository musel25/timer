import type { Habit, Session } from '../lib/types';
import { habitHeatmap } from '../lib/stats';
import { categoryColor } from '../lib/palette';

const WEEKS = 18;

/**
 * A per-habit activity grid (18 weeks, 7 rows). Time habits shade each day by
 * the habit's minutes in its own category color; abstinence habits fill days
 * they were marked. Mirrors the layout of the global "Minutes / day" graph.
 */
export function HabitGrid({ habit, sessions, weekStart }: { habit: Habit; sessions: Session[]; weekStart: number }) {
  const days = habitHeatmap(sessions, WEEKS * 7, habit.id);
  const firstDay = new Date(days[0].date + 'T00:00:00');
  const lead = (firstDay.getDay() - weekStart + 7) % 7;
  const color = categoryColor(habit.id);
  const empty = 'rgb(var(--ink-700))';

  function fill(d: { minutes: number; done: boolean }): string {
    if (habit.kind === 'abstain') return d.done ? `rgb(${color.rgb})` : empty;
    if (d.minutes <= 0) return empty;
    const op = d.minutes < 10 ? 0.35 : d.minutes < 20 ? 0.55 : d.minutes < 40 ? 0.78 : 1;
    return `rgb(${color.rgb} / ${op})`;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="grid grid-flow-col gap-1" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead${i}`} className="h-3 w-3" />
        ))}
        {days.map((d) => (
          <div
            key={d.date}
            title={habit.kind === 'abstain' ? `${d.date}: ${d.done ? 'done' : '—'}` : `${d.date}: ${d.minutes} min`}
            className="h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: fill(d) }}
          />
        ))}
      </div>
    </div>
  );
}
