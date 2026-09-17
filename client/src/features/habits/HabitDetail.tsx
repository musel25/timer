import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Flame, Palmtree, Moon } from 'lucide-react';
import { useHabits, useSessions, useSettings, useVacationDays, useRestDays } from '../../lib/hooks';
import { habitStreak, effectiveGoal } from '../../lib/stats';
import { dateToKey, keyToDate, todayKey, addDaysKey } from '../../lib/date';
import { HabitGrid } from '../../components/HabitGrid';
import { categoryColor } from '../../lib/palette';
import { DayMarkerCalendar } from './DayMarkerCalendar';
import { cadenceLabel, cadenceOf } from '../../lib/cadence';
import { PeriodHistory } from './PeriodHistory';
import { EntryHistory } from './EntryHistory';

type Tab = 'overview' | 'month';


export function HabitDetail() {
  const { id } = useParams();
  const { data: habits = [], isLoading } = useHabits();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { data: vacationRows = [] } = useVacationDays();
  const { data: restRows = [] } = useRestDays();

  const [tab, setTab] = useState<Tab>('overview');

  const habit = habits.find((h) => h.id === id);
  const weekStart = settings?.weekStart ?? 1;
  const vacationDays = new Set(vacationRows.map((r) => r.date));
  const restDays = new Set(restRows.map((r) => r.date));

  if (isLoading) return <div className="py-16 text-center text-slate-500">Loading…</div>;
  if (!habit) {
    return (
      <div className="space-y-4">
        <Link to="/habits" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={15} /> Habits</Link>
        <p className="py-12 text-center text-slate-500">Habit not found.</p>
      </div>
    );
  }

  // Per-habit minutes per local day, from logged sessions.
  const minutesByDay: Record<string, number> = {};
  for (const s of sessions) {
    if (s.habitId !== habit.id) continue;
    const k = dateToKey(new Date(s.startedAt));
    minutesByDay[k] = (minutesByDay[k] ?? 0) + s.actualSeconds / 60;
  }
  const activeDayKeys = Object.keys(minutesByDay).filter((k) => minutesByDay[k] > 0);
  const totalMinutes = activeDayKeys.reduce((sum, k) => sum + minutesByDay[k], 0);
  const avgPerActiveDay = activeDayKeys.length ? Math.round(totalMinutes / activeDayKeys.length) : 0;
  const streak = habitStreak(habit, sessions, restDays, vacationDays);

  const goalMetOn = (key: string) => {
    const goal = effectiveGoal(habit, keyToDate(key).getTime(), vacationDays);
    return goal != null && (minutesByDay[key] ?? 0) >= goal;
  };

  return (
    <div className="space-y-6">
      <Link to="/habits" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={15} /> Habits</Link>

      <header className="hero flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold md:text-4xl">{habit.name}</h1>
          {/* The day a weekly/monthly habit comes round, stated where you look
              it up rather than only on the agenda that nudges you. */}
          {cadenceLabel(habit) && <p className="mt-1 text-sm text-slate-400">{cadenceLabel(habit)}</p>}
        </div>
        <Link to={`/habits/${habit.id}/edit`} className="flex items-center gap-1.5 rounded-full border border-ink-600/60 bg-ink-900/30 px-3 py-2 text-sm text-slate-300 backdrop-blur hover:text-slate-100">
          <Pencil size={15} /> Edit
        </Link>
      </header>

      {/* The Month tab paints rest/vacation days, which only bear on daily
          streaks — a weekly habit has nothing to paint there. */}
      {cadenceOf(habit) === 'daily' && (
        <div className="flex gap-2">
          {(['overview', 'month'] as Tab[]).map((t) => (
            <button key={t} className={`chip flex-1 ${tab === t ? 'chip-active' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : 'Month'}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' || cadenceOf(habit) !== 'daily' ? (
        <OverviewTab habit={habit} sessions={sessions} weekStart={weekStart} streak={streak} avgPerActiveDay={avgPerActiveDay} minutesByDay={minutesByDay} goalMetOn={goalMetOn} vacationDays={vacationDays} restDays={restDays} />
      ) : (
        <div className="space-y-3">
          <DayMarkerCalendar minutesByDay={minutesByDay} dotColor={categoryColor(habit.id).rgb} />
          <p className="text-xs text-slate-500">
            Rest &amp; vacation days are global — they apply to every habit, and can also be set under
            {' '}<Link to="/settings" className="text-accent hover:underline">Settings</Link>.
            What a vacation day asks of <em>this</em> habit is its vacation goal, in the editor.
          </p>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ habit, sessions, weekStart, streak, avgPerActiveDay, minutesByDay, goalMetOn, vacationDays, restDays }: {
  habit: import('../../lib/types').Habit;
  sessions: import('../../lib/types').Session[];
  weekStart: number;
  streak: number;
  avgPerActiveDay: number;
  minutesByDay: Record<string, number>;
  goalMetOn: (key: string) => boolean;
  vacationDays: Set<string>;
  restDays: Set<string>;
}) {
  // Last 14 days, most recent first.
  const today = todayKey();
  const recent = Array.from({ length: 14 }, (_, i) => addDaysKey(today, -i));
  const cadence = cadenceOf(habit);
  const unit = cadence === 'weekly' ? 'week' : cadence === 'monthly' ? 'month' : 'day';

  if (cadence !== 'daily') {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <span className="stat-pill" style={{ color: 'rgb(217 144 30)' }}>
            <Flame size={15} /> {streak > 0 ? `${streak}-${unit} streak` : 'No streak yet'}
          </span>
        </div>

        <section className="card p-4">
          <h2 className="label mb-3">History</h2>
          <PeriodHistory habit={habit} sessions={sessions} />
        </section>

        <EntryHistory habit={habit} sessions={sessions} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <span className="stat-pill" style={{ color: 'rgb(217 144 30)' }}><Flame size={15} /> {streak > 0 ? `${streak}-day streak` : 'No streak yet'}</span>
        <span className="stat-pill" style={{ color: 'rgb(124 92 246)' }}>{avgPerActiveDay} min/active day</span>
      </div>

      <section className="card p-4">
        <h2 className="label mb-1">Activity</h2>
        <HabitGrid habit={habit} sessions={sessions} weekStart={weekStart} />
      </section>

      <section className="card p-4">
        <h2 className="label mb-3">Recent days</h2>
        <div className="divide-y divide-ink-600">
          {recent.map((key) => {
            const min = Math.round(minutesByDay[key] ?? 0);
            const met = goalMetOn(key);
            const d = keyToDate(key);
            return (
              <div key={key} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-300">
                  {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {vacationDays.has(key) && <Palmtree size={13} className="ml-1.5 inline text-green-500" />}
                  {restDays.has(key) && <Moon size={13} className="ml-1.5 inline text-violet-400" />}
                </span>
                <span className={met ? 'font-medium text-accent' : 'text-slate-400'}>
                  {min > 0 ? `${min} min` : '—'}{met ? ' ✓' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <EntryHistory habit={habit} sessions={sessions} />
    </div>
  );
}

