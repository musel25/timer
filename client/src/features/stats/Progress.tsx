import type { ReactNode } from 'react';
import { Flame, Clock, CalendarRange, Sparkles } from 'lucide-react';
import { useHabits, useRestDays, useSessions, useSettings, useVacationDays } from '../../lib/hooks';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { currentStreak, effectiveGoal, focusMinutes, habitStreak, heatmap, minutesByHabitInRange, minutesInRange, todaySummary } from '../../lib/stats';
import { startOfToday, addDays } from '../../lib/time';
import { todayKey } from '../../lib/date';
import { GoalBar } from '../../components/GoalBar';
import { HabitGrid } from '../../components/HabitGrid';

const WEEKS = 18;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Legend swatch thresholds (minutes) — kept in sync with `intensity`.
const LEGEND_MIN = [0, 8, 15, 30, 50];

export function Progress() {
  const { data: sessions = [] } = useSessions();
  const { data: habits = [] } = useHabits();
  const { data: settings } = useSettings();
  const { data: restDayRows = [] } = useRestDays();
  const { data: vacationRows = [] } = useVacationDays();
  const restDays = new Set(restDayRows.map((r) => r.date));
  const vacationDays = new Set(vacationRows.map((r) => r.date));
  const weekStart = settings?.weekStart ?? 1;

  const streak = currentStreak(sessions, undefined, restDays);
  const weekAgo = addDays(startOfToday(), -6);
  const monthAgo = addDays(startOfToday(), -29);
  const weekMin = minutesInRange(sessions, weekAgo);
  const monthMin = minutesInRange(sessions, monthAgo);

  const summary = todaySummary(sessions);
  const byHabit = minutesByHabitInRange(sessions, weekAgo);
  const ranked = habits
    .filter((h) => !h.archived)
    .map((h) => ({
      h,
      weekMin: Math.round(byHabit[h.id] ?? 0),
      minutes: summary.minutesByHabit[h.id] ?? 0,
      goal: effectiveGoal(h, startOfToday(), vacationDays),
      streak: habitStreak(h, sessions, restDays, vacationDays),
    }))
    .sort((a, b) => Number(b.h.kind !== 'abstain') - Number(a.h.kind !== 'abstain') || b.weekMin - a.weekMin);

  const todayHabitMin = Math.round(Object.values(summary.minutesByHabit).reduce((a, b) => a + b, 0));
  const focusWeekMin = Math.round(focusMinutes(sessions, weekAgo));
  const focusTodayMin = Math.round(focusMinutes(sessions, startOfToday()));

  // Build the activity calendar as week columns (oldest → newest) so month
  // labels and a today marker can anchor the otherwise abstract grid.
  const days = heatmap(sessions, WEEKS * 7);
  const lead = (new Date(days[0].date + 'T00:00:00').getDay() - weekStart + 7) % 7;
  const cells: (typeof days[number] | null)[] = [...Array(lead).fill(null), ...days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const tk = todayKey();

  function intensity(min: number): string {
    if (min <= 0) return 'rgb(var(--ink-700))';
    const op = min < 10 ? 0.3 : min < 20 ? 0.5 : min < 40 ? 0.75 : 1;
    return `rgb(var(--accent) / ${op})`;
  }

  // Month label for a week column: shown once, on the first week whose lead day
  // falls in a new month.
  let prevMonth = -1;
  const weekLabel = (week: (typeof cells)) => {
    const first = week.find(Boolean);
    if (!first) return '';
    const m = new Date(first.date + 'T00:00:00').getMonth();
    if (m === prevMonth) return '';
    prevMonth = m;
    return MONTHS[m];
  };

  return (
    <div className="space-y-6">
      <header className="hero flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Progress</h1>
          <p className="mt-1 text-sm text-slate-300">Logged minutes and streaks over time</p>
        </div>
        {/* The streak is the headline metric of a habit tracker. */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: tint('217 144 30', 0.18), color: 'rgb(217 144 30)' }}>
            <Flame size={24} />
          </span>
          <div>
            <div className="text-3xl font-bold leading-none tabular-nums">{streak}</div>
            <div className="text-xs text-slate-400">day{streak === 1 ? '' : 's'} in a row</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard rgb="124 92 246" icon={<Sparkles size={18} />} value={`${summary.minutes}m`} label="Today" />
        <StatCard rgb="58 109 240" icon={<Clock size={18} />} value={`${weekMin}m`} label="This week" />
        <StatCard rgb="22 160 107" icon={<CalendarRange size={18} />} value={`${monthMin}m`} label="Last 30 days" />
        <StatCard rgb="20 184 166" icon={<Clock size={18} />} value={`${focusWeekMin}m`} label="Focus / week" />
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label">Minutes per day</h2>
          <Legend intensity={intensity} />
        </div>
        <div className="card overflow-x-auto p-4">
          <div className="inline-block">
            <div className="mb-1 flex gap-1">
              {weeks.map((w, wi) => (
                <div key={wi} className="w-3.5 shrink-0 text-[10px] leading-none text-slate-500">
                  <span className="whitespace-nowrap">{weekLabel(w)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              {weeks.map((w, wi) => (
                <div key={wi} className="flex shrink-0 flex-col gap-1">
                  {w.map((d, di) =>
                    d ? (
                      <div
                        key={d.date}
                        title={`${d.date}: ${d.minutes} min`}
                        className="h-3.5 w-3.5 rounded-[3px]"
                        style={{
                          backgroundColor: intensity(d.minutes),
                          boxShadow: d.date === tk ? '0 0 0 1.5px rgb(var(--accent))' : undefined,
                        }}
                      />
                    ) : (
                      <div key={`e${wi}-${di}`} className="h-3.5 w-3.5" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label">By habit</h2>
          <span className="text-xs text-slate-400">Today: {todayHabitMin} min · {focusTodayMin}m focus</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ranked.map(({ h, weekMin, minutes, goal, streak }) => {
            const color = categoryColor(h.id);
            const abstain = h.kind === 'abstain';
            return (
              <div key={h.id} className="card p-4">
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundImage: gradient(color.rgb) }}>
                    <HabitIcon name={h.emoji} size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.name}</span>
                  {streak > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-500">
                      <Flame size={12} />{streak}
                    </span>
                  )}
                </div>
                {abstain ? (
                  <div className="text-xs text-slate-400">
                    {streak > 0 ? `${streak}-day clean streak` : 'No clean streak yet'}
                  </div>
                ) : goal ? (
                  <GoalBar done={minutes} goal={goal} rgb={color.rgb} />
                ) : (
                  <div className="text-xs text-slate-400">{Math.round(minutes)} min today · no goal set</div>
                )}
                {!abstain && <div className="mt-1.5 text-[11px] text-slate-500">{weekMin} min this week</div>}
                <HabitGrid habit={h} sessions={sessions} weekStart={weekStart} />
              </div>
            );
          })}
          {ranked.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No habits yet.</p>}
        </div>
      </section>
    </div>
  );
}

function Legend({ intensity }: { intensity: (min: number) => string }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-slate-500">
      <span>Less</span>
      {LEGEND_MIN.map((m) => (
        <span key={m} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: intensity(m) }} />
      ))}
      <span>More</span>
    </div>
  );
}

function StatCard({ rgb, icon, value, label }: { rgb: string; icon: ReactNode; value: string; label: string }) {
  return (
    <div className="card p-4" style={{ backgroundImage: `linear-gradient(160deg, ${tint(rgb, 0.16)}, transparent 70%)` }}>
      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: tint(rgb, 0.18), color: solid(rgb) }}>{icon}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
