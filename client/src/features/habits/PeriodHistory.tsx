import type { Habit, Session } from '../../lib/types';
import { cadenceOf, periodHistory, targetOf } from '../../lib/cadence';
import { categoryColor } from '../../lib/palette';

/**
 * A weekly or monthly habit's history as one cell per period. The daily
 * activity grid is useless here — a habit that comes round once a month would
 * be 30 empty squares and one filled — so this counts periods instead, shading
 * partial ones for habits whose target is more than one.
 */
export function PeriodHistory({ habit, sessions, count }: { habit: Habit; sessions: Session[]; count?: number }) {
  const cadence = cadenceOf(habit);
  const cells = periodHistory(habit, sessions, count ?? (cadence === 'monthly' ? 12 : 26));
  const color = categoryColor(habit.id);
  const target = targetOf(habit);
  const empty = 'rgb(var(--ink-700))';

  const fill = (c: { count: number; satisfied: boolean }) => {
    if (c.satisfied) return `rgb(${color.rgb})`;
    if (c.count <= 0) return empty;
    return `rgb(${color.rgb} / ${Math.max(0.3, c.count / target)})`;
  };

  const met = cells.filter((c) => c.satisfied).length;

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {cells.map((c) => (
          <div key={c.key} className="shrink-0 text-center">
            <div
              title={`${c.key}: ${c.count}/${target}`}
              className="h-8 w-8 rounded-md"
              style={{ backgroundColor: fill(c) }}
            />
            <div className="mt-1 text-[10px] text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {met} of the last {cells.length} {cadence === 'monthly' ? 'months' : 'weeks'} met
      </p>
    </div>
  );
}
