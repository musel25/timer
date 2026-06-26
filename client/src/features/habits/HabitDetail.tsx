import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Flame, Palmtree, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHabits, useSessions, useSettings, useVacationDays, useRestDays, useSetVacationRange, useSetRestRange } from '../../lib/hooks';
import { habitStreak, effectiveGoal } from '../../lib/stats';
import { dateToKey, keyToDate, todayKey, addDaysKey, monthMatrix, monthLabel } from '../../lib/date';
import { HabitGrid } from '../../components/HabitGrid';
import { categoryColor } from '../../lib/palette';
import { INITIAL_RANGE, tapDay } from './rangeSelect';

type Tab = 'overview' | 'month';
type Mode = 'vacation' | 'rest';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HabitDetail() {
  const { id } = useParams();
  const { data: habits = [], isLoading } = useHabits();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { data: vacationRows = [] } = useVacationDays();
  const { data: restRows = [] } = useRestDays();
  const setVacationRange = useSetVacationRange();
  const setRestRange = useSetRestRange();

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
        <h1 className="text-3xl font-bold md:text-4xl">{habit.name}</h1>
        <Link to={`/habits/${habit.id}/edit`} className="flex items-center gap-1.5 rounded-full border border-ink-600/60 bg-ink-900/30 px-3 py-2 text-sm text-slate-300 backdrop-blur hover:text-slate-100">
          <Pencil size={15} /> Edit
        </Link>
      </header>

      <div className="flex gap-2">
        {(['overview', 'month'] as Tab[]).map((t) => (
          <button key={t} className={`chip flex-1 ${tab === t ? 'chip-active' : ''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : 'Month'}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <OverviewTab habit={habit} sessions={sessions} weekStart={weekStart} streak={streak} avgPerActiveDay={avgPerActiveDay} minutesByDay={minutesByDay} goalMetOn={goalMetOn} vacationDays={vacationDays} restDays={restDays} />
      ) : (
        <MonthTab
          weekStart={weekStart}
          minutesByDay={minutesByDay}
          habitId={habit.id}
          vacationDays={vacationDays}
          restDays={restDays}
          onVacationRange={(start, end, on) => setVacationRange.mutate({ start, end, on })}
          onRestRange={(start, end, on) => setRestRange.mutate({ start, end, on })}
        />
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
    </div>
  );
}

function MonthTab({ weekStart, minutesByDay, habitId, vacationDays, restDays, onVacationRange, onRestRange }: {
  weekStart: number;
  minutesByDay: Record<string, number>;
  habitId: string;
  vacationDays: Set<string>;
  restDays: Set<string>;
  onVacationRange: (start: string, end: string, on: boolean) => void;
  onRestRange: (start: string, end: string, on: boolean) => void;
}) {
  const now = keyToDate(todayKey());
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [mode, setMode] = useState<Mode>('vacation');
  const [range, setRange] = useState(INITIAL_RANGE);

  const weeks = monthMatrix(year, month0, weekStart);
  const color = categoryColor(habitId);
  const markedSet = mode === 'vacation' ? vacationDays : restDays;
  const apply = mode === 'vacation' ? onVacationRange : onRestRange;

  function prevMonth() { const m = month0 - 1; if (m < 0) { setYear(year - 1); setMonth0(11); } else setMonth0(m); setRange(INITIAL_RANGE); }
  function nextMonth() { const m = month0 + 1; if (m > 11) { setYear(year + 1); setMonth0(0); } else setMonth0(m); setRange(INITIAL_RANGE); }

  function onDay(key: string) {
    const res = tapDay(range, key, markedSet.has(key));
    setRange(res.state);
    if (res.commit) apply(res.commit.start, res.commit.end, true);
    if (res.clearDay) apply(res.clearDay, res.clearDay, false);
  }

  const headerCols = Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStart + i) % 7]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className={`chip ${mode === 'vacation' ? 'chip-active' : ''}`} onClick={() => { setMode('vacation'); setRange(INITIAL_RANGE); }}><Palmtree size={14} /> Vacation</button>
          <button className={`chip ${mode === 'rest' ? 'chip-active' : ''}`} onClick={() => { setMode('rest'); setRange(INITIAL_RANGE); }}><Moon size={14} /> Rest</button>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-2.5 py-1.5" onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <span className="min-w-[7.5rem] text-center text-sm font-medium">{monthLabel(year, month0)}</span>
          <button className="btn-ghost px-2.5 py-1.5" onClick={nextMonth} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {range.pendingStart ? 'Now tap the end day to mark the range.' : `Tap a start day then an end day to mark ${mode === 'vacation' ? 'vacation' : 'rest'} days. Vacation & rest days are global — they apply to every habit.`}
      </p>

      <div className="card p-3">
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {headerCols.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((key) => {
                const inMonth = keyToDate(key).getMonth() === month0;
                const isVacation = vacationDays.has(key);
                const isRest = restDays.has(key);
                const isPending = range.pendingStart === key;
                const min = minutesByDay[key] ?? 0;
                return (
                  <button
                    key={key}
                    onClick={() => onDay(key)}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition ${
                      isPending ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-ink-700'
                    } ${inMonth ? 'text-slate-200' : 'text-slate-600'}`}
                  >
                    <span>{keyToDate(key).getDate()}</span>
                    <span className="mt-0.5 flex h-2 items-center gap-0.5">
                      {min > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(${color.rgb})` }} />}
                      {isVacation && <Palmtree size={11} className="text-green-500" />}
                      {isRest && <Moon size={11} className="text-violet-400" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
