import { Link } from 'react-router-dom';
import { useHabits, useGroups, useSessions, useSettings, useLogSession } from '../../lib/hooks';
import type { Habit } from '../../lib/types';
import { Timer, Plus } from 'lucide-react';
import { todaySummary } from '../../lib/stats';
import { HabitIcon } from '../../lib/habitIcons';
import { useRun } from '../run/RunContext';
import { HabitCard } from '../habits/HabitCard';

export function Dashboard() {
  const { data: habits = [] } = useHabits();
  const { data: groups = [] } = useGroups();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { startRun } = useRun();
  const logSession = useLogSession();

  const today = todaySummary(sessions);
  const active = habits.filter((h) => !h.archived);

  function start(habit: Habit, min: number) {
    const prep = settings?.prepSeconds ?? 5;
    startRun({
      type: 'simple',
      label: habit.name,
      habitId: habit.id,
      plannedSeconds: min * 60,
      config: { totalSeconds: min * 60, prepSeconds: prep },
    });
  }

  const log = (habit: Habit, min: number) => logSession.mutate({ habitId: habit.id, minutes: min });

  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = active.filter((h) => !h.groupId || !groups.some((g) => g.id === h.groupId));

  return (
    <div className="space-y-6">
      <header className="hero flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Habits</h1>
          <div className="mt-1 text-sm text-slate-300">
            {today.count > 0 ? `Today · ${today.count} done · ${today.minutes} min` : 'Tap a duration to start a focus block'}
          </div>
        </div>
        <Link to="/timers" className="flex items-center rounded-full border border-ink-600/60 bg-ink-900/30 p-2.5 text-slate-300 backdrop-blur hover:text-slate-100" title="Timer presets"><Timer size={18} /></Link>
      </header>

      {ordered.map((group) => {
        const list = active.filter((h) => h.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder);
        if (list.length === 0) return null;
        return (
          <section key={group.id}>
            <h2 className="label mb-2 flex items-center gap-2">
              <HabitIcon name={group.emoji} size={16} /> {group.name}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((h) => (
                <HabitCard key={h.id} habit={h} blocksToday={today.blocksByHabit[h.id] ?? 0} onStart={start} onLog={log} editTo={`/habits/${h.id}`} />
              ))}
            </div>
          </section>
        );
      })}

      {ungrouped.length > 0 && (
        <section>
          <h2 className="label mb-2">Other</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ungrouped.map((h) => (
              <HabitCard key={h.id} habit={h} blocksToday={today.blocksByHabit[h.id] ?? 0} onStart={start} onLog={log} editTo={`/habits/${h.id}`} />
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && (
        <p className="py-8 text-center text-slate-500">No habits yet — add your first one below.</p>
      )}

      <div className="grid grid-cols-2 gap-3 pt-2 sm:max-w-md">
        <Link to="/timer" className="btn-accent"><Timer size={16} /> Timer</Link>
        <Link to="/habits/new" className="btn-ghost"><Plus size={16} /> Habit</Link>
      </div>
    </div>
  );
}
