import type { ReactNode } from 'react';
import { Flame, Clock, CalendarRange } from 'lucide-react';
import { useHabits, useSessions, useSettings } from '../../lib/hooks';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { currentStreak, focusMinutesByTag, goalBlocks, goalStreak, heatmap, minutesByHabitInRange, minutesInRange, todaySummary } from '../../lib/stats';
import { startOfToday, addDays } from '../../lib/time';
import { BlockBar } from '../../components/BlockBar';

const WEEKS = 18;

export function Progress() {
  const { data: sessions = [] } = useSessions();
  const { data: habits = [] } = useHabits();
  const { data: settings } = useSettings();
  const weekStart = settings?.weekStart ?? 1;

  const streak = currentStreak(sessions);
  const weekAgo = addDays(startOfToday(), -6);
  const monthAgo = addDays(startOfToday(), -29);
  const weekMin = minutesInRange(sessions, weekAgo);
  const monthMin = minutesInRange(sessions, monthAgo);

  const days = heatmap(sessions, WEEKS * 7);
  const firstDay = new Date(days[0].date + 'T00:00:00');
  const lead = (firstDay.getDay() - weekStart + 7) % 7;

  const summary = todaySummary(sessions);
  const byHabit = minutesByHabitInRange(sessions, weekAgo);
  const ranked = habits
    .filter((h) => !h.archived)
    .map((h) => ({
      h,
      weekMin: Math.round(byHabit[h.id] ?? 0),
      blocks: summary.blocksByHabit[h.id] ?? 0,
      goal: goalBlocks(h.dailyGoalMin),
      streak: goalStreak(sessions, h.id, h.dailyGoalMin),
    }))
    .sort((a, b) => b.weekMin - a.weekMin);

  const todayBlocks = Object.values(summary.blocksByHabit).reduce((a, b) => a + b, 0);
  const todayHabitMin = Math.round(Object.values(summary.minutesByHabit).reduce((a, b) => a + b, 0));

  const focusWeek = focusMinutesByTag(sessions, weekAgo);
  const focusToday = focusMinutesByTag(sessions, startOfToday());
  const focusRows = (
    [
      { key: 'work', label: 'Work', week: Math.round(focusWeek.work), today: Math.round(focusToday.work) },
      { key: 'study', label: 'Study', week: Math.round(focusWeek.study), today: Math.round(focusToday.study) },
      { key: 'other', label: 'Other focus', week: Math.round(focusWeek.other), today: Math.round(focusToday.other) },
    ] as const
  ).filter((r) => r.key !== 'other' || r.week > 0);
  const maxFocus = Math.max(1, ...focusRows.map((r) => r.week));

  function intensity(min: number): string {
    if (min <= 0) return 'rgb(var(--ink-700))';
    const op = min < 10 ? 0.3 : min < 20 ? 0.5 : min < 40 ? 0.75 : 1;
    return `rgb(var(--accent) / ${op})`;
  }

  return (
    <div className="space-y-6">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Progress</h1>
        <p className="mt-1 text-sm text-slate-300">Your focus minutes and streaks over time</p>
      </header>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <StatCard rgb="217 144 30" icon={<Flame size={18} />} value={String(streak)} label="Day streak" />
        <StatCard rgb="58 109 240" icon={<Clock size={18} />} value={`${weekMin}m`} label="This week" />
        <StatCard rgb="124 92 246" icon={<CalendarRange size={18} />} value={`${monthMin}m`} label="30 days" />
      </div>

      <section>
        <h2 className="label mb-2">Minutes / day</h2>
        <div className="card overflow-x-auto p-4">
          <div className="grid grid-flow-col gap-1" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
            {Array.from({ length: lead }).map((_, i) => (
              <div key={`lead${i}`} className="h-3.5 w-3.5" />
            ))}
            {days.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.minutes} min`}
                className="h-3.5 w-3.5 rounded-[3px]"
                style={{ backgroundColor: intensity(d.minutes) }}
              />
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label">By habit · today vs goal</h2>
          <span className="text-xs text-slate-400">Today: {todayBlocks} block{todayBlocks === 1 ? '' : 's'} · {todayHabitMin} min</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ranked.map(({ h, weekMin, blocks, goal, streak }) => {
            const color = categoryColor(h.id);
            return (
              <div key={h.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ backgroundImage: gradient(color.rgb) }}>
                      <HabitIcon name={h.emoji} size={15} />
                    </span>
                    {h.name}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    {weekMin}m this week
                    {streak > 0 && <span className="flex items-center gap-0.5">· <Flame size={12} className="text-amber-500" />{streak}</span>}
                  </span>
                </div>
                {goal ? (
                  <BlockBar done={blocks} goal={goal} rgb={color.rgb} />
                ) : (
                  <div className="text-xs text-slate-400">{blocks} block{blocks === 1 ? '' : 's'} today · no goal set</div>
                )}
              </div>
            );
          })}
          {ranked.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No habits yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="label mb-2">Focus · this week</h2>
        <div className="card space-y-4 p-4">
          {focusRows.map((r) => (
            <div key={r.key}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span>{r.label}</span>
                <span className="text-slate-400">{r.week}m this week · {r.today}m today</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(r.week / maxFocus) * 100}%` }} />
              </div>
            </div>
          ))}
          {focusRows.every((r) => r.week === 0) && (
            <p className="text-center text-sm text-slate-500">No focus sessions this week yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ rgb, icon, value, label }: { rgb: string; icon: ReactNode; value: string; label: string }) {
  return (
    <div className="card p-4" style={{ backgroundImage: `linear-gradient(160deg, ${tint(rgb, 0.16)}, transparent 70%)` }}>
      <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: tint(rgb, 0.18), color: solid(rgb) }}>{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
