import type { ReactNode } from 'react';
import { Flame, Clock, CalendarRange } from 'lucide-react';
import { useGroups, useHabits, useSessions, useSettings } from '../../lib/hooks';
import { HabitIcon } from '../../lib/habitIcons';
import { categoryColor, gradient, tint, solid } from '../../lib/palette';
import { currentStreak, focusMinutes, goalStreak, heatmap, minutesByHabitInRange, minutesInRange, todaySummary } from '../../lib/stats';
import { startOfToday, addDays } from '../../lib/time';
import { GoalBar } from '../../components/GoalBar';

const WEEKS = 18;

export function Progress() {
  const { data: sessions = [] } = useSessions();
  const { data: habits = [] } = useHabits();
  const { data: settings } = useSettings();
  const { data: groups = [] } = useGroups();
  const weekdaysOnlyGroups = new Set(groups.filter((g) => g.weekdaysOnly).map((g) => g.id));
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
      minutes: summary.minutesByHabit[h.id] ?? 0,
      goal: h.dailyGoalMin && h.dailyGoalMin > 0 ? h.dailyGoalMin : null,
      streak:
        h.kind === 'abstain'
          ? currentStreak(sessions, h.id)
          : goalStreak(sessions, h.id, h.dailyGoalMin, !!h.groupId && weekdaysOnlyGroups.has(h.groupId)),
    }))
    .sort((a, b) => Number(b.h.kind !== 'abstain') - Number(a.h.kind !== 'abstain') || b.weekMin - a.weekMin);

  const todayHabitMin = Math.round(Object.values(summary.minutesByHabit).reduce((a, b) => a + b, 0));

  const focusWeekMin = Math.round(focusMinutes(sessions, weekAgo));
  const focusTodayMin = Math.round(focusMinutes(sessions, startOfToday()));

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
          <span className="text-xs text-slate-400">Today: {todayHabitMin} min</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ranked.map(({ h, weekMin, minutes, goal, streak }) => {
            const color = categoryColor(h.id);
            const abstain = h.kind === 'abstain';
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
                    {abstain ? 'clean days' : `${weekMin}m this week`}
                    {streak > 0 && <span className="flex items-center gap-0.5">· <Flame size={12} className="text-amber-500" />{streak}</span>}
                  </span>
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
              </div>
            );
          })}
          {ranked.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No habits yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="label mb-2">Focus · this week</h2>
        <div className="card flex items-baseline justify-between p-4 text-sm">
          <span>Focus sessions</span>
          <span className="text-slate-400">
            {focusWeekMin > 0 ? `${focusWeekMin}m this week · ${focusTodayMin}m today` : 'No focus sessions this week yet.'}
          </span>
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
