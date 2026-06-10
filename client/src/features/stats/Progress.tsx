import type { ReactNode } from 'react';
import { Flame } from 'lucide-react';
import { useHabits, useSessions, useSettings } from '../../lib/hooks';
import { HabitIcon } from '../../lib/habitIcons';
import { currentStreak, heatmap, minutesByHabitInRange, minutesInRange } from '../../lib/stats';
import { startOfToday, addDays } from '../../lib/time';

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

  const byHabit = minutesByHabitInRange(sessions, weekAgo);
  const ranked = habits
    .filter((h) => !h.archived)
    .map((h) => ({ h, min: Math.round(byHabit[h.id] ?? 0), streak: currentStreak(sessions, h.id) }))
    .sort((a, b) => b.min - a.min);
  const maxMin = Math.max(1, ...ranked.map((r) => r.min));

  function intensity(min: number): string {
    if (min <= 0) return 'rgb(233 235 239)'; // --border (light empty cell)
    const op = min < 10 ? 0.3 : min < 20 ? 0.5 : min < 40 ? 0.75 : 1;
    return `rgb(var(--accent) / ${op})`;
  }

  return (
    <div className="space-y-6">
      <h1 className="pt-1 text-2xl font-bold">Progress</h1>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Streak" value={<><Flame size={18} className="text-amber-500" />{streak}</>} />
        <Stat label="This week" value={`${weekMin}m`} />
        <Stat label="30 days" value={`${monthMin}m`} />
      </div>

      <section>
        <h2 className="label mb-2">Minutes / day</h2>
        <div className="card overflow-x-auto p-3">
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
        <h2 className="label mb-2">By habit · this week</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ranked.map(({ h, min, streak }) => (
            <div key={h.id} className="card p-3">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><HabitIcon name={h.emoji} size={16} className="text-slate-300" />{h.name}</span>
                <span className="flex items-center gap-1 text-slate-400">
                  {min}m{h.dailyGoalMin ? ` · goal ${h.dailyGoalMin}m/d` : ''}
                  {streak > 0 && <span className="flex items-center gap-0.5">· <Flame size={12} className="text-amber-500" />{streak}</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(min / maxMin) * 100}%` }} />
              </div>
            </div>
          ))}
          {ranked.every((r) => r.min === 0) && <p className="py-4 text-center text-sm text-slate-500">No sessions this week yet.</p>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-xl font-bold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
