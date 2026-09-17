import { Flame } from 'lucide-react';
import { useHabits, useRestDays, useSessions, useVacationDays } from '../../lib/hooks';
import { adherenceDays } from '../../lib/adherence';
import { currentStreak } from '../../lib/stats';

const DAYS = 7;

/** Accent opacity for a day's fraction. Deliberately coarse: the square says
 *  "none / some / most / all" at a glance, and nothing finer is readable at
 *  12px anyway. */
function fill(done: number, total: number): string {
  if (total === 0 || done === 0) return 'rgb(var(--ink-700))';
  const frac = done / total;
  const op = frac >= 1 ? 1 : frac >= 0.66 ? 0.72 : frac >= 0.33 ? 0.46 : 0.26;
  return `rgb(var(--accent) / ${op})`;
}

/**
 * The one-line answer to "am I following my habits?": streak, today's daily
 * habits as a bar, and the last week as squares.
 *
 * It lives in the hero of both the Week board (the landing tab, where it is a
 * reminder you did not ask for) and the Habits dashboard (where it heads the
 * work itself), from one component so the two can never disagree.
 *
 * Minutes are on purpose absent. Minutes are the input; whether the day's
 * habits got done is the outcome, and only the outcome belongs in a glance.
 */
export function HabitPulse() {
  const { data: habits = [] } = useHabits();
  const { data: sessions = [] } = useSessions();
  const { data: restDayRows = [] } = useRestDays();
  const { data: vacationRows = [] } = useVacationDays();

  const restDays = new Set(restDayRows.map((r) => r.date));
  const vacationDays = new Set(vacationRows.map((r) => r.date));
  const days = adherenceDays(habits, sessions, DAYS, restDays, vacationDays);
  const today = days[days.length - 1];
  const streak = currentStreak(sessions, undefined, restDays);
  const pct = today.total > 0 ? (today.done / today.total) * 100 : 0;
  // Nothing to be faithful to yet (fresh install, or every habit weekly):
  // an empty bar and a row of grey squares would be a reproach for no reason.
  if (streak === 0 && days.every((d) => d.total === 0)) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <span className="flex items-center gap-1.5 text-xl font-bold tabular-nums" style={{ color: 'rgb(217 144 30)' }}>
        <Flame size={20} /> {streak}
      </span>

      <span className="flex min-w-[8rem] flex-1 items-center gap-2.5">
        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-700">
          <span
            className="block h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className={`text-sm tabular-nums ${today.done === today.total && today.total > 0 ? 'font-semibold text-accent' : 'text-slate-400'}`}>
          {today.total > 0 ? `${today.done}/${today.total}` : today.rest ? 'rest' : '—'}
        </span>
      </span>

      <span className="flex items-center gap-1.5">
        {days.map((d, i) => (
          <span
            key={d.date}
            title={d.rest ? `${d.date} · rest day` : `${d.date} · ${d.done}/${d.total}`}
            className={`h-3.5 w-3.5 rounded-[4px] ${d.rest ? 'border border-dashed border-ink-500' : ''} ${
              i === days.length - 1 ? 'ring-1 ring-accent/60 ring-offset-1 ring-offset-transparent' : ''
            }`}
            style={{ backgroundColor: d.rest ? 'transparent' : fill(d.done, d.total) }}
          />
        ))}
      </span>
    </div>
  );
}
