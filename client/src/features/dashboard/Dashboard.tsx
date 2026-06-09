import { Link } from 'react-router-dom';
import { useHabits, useGroups, useSessions, useSettings } from '../../lib/hooks';
import type { Habit } from '../../lib/types';
import { currentStreak, todaySummary } from '../../lib/stats';
import { useRun } from '../run/RunContext';

export function Dashboard() {
  const { data: habits = [] } = useHabits();
  const { data: groups = [] } = useGroups();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { startRun } = useRun();

  const streak = currentStreak(sessions);
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

  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = active.filter((h) => !h.groupId || !groups.some((g) => g.id === h.groupId));
  const today_date = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between pt-1">
        <div>
          <div className="text-sm text-slate-400">{today_date}</div>
          <div className="mt-0.5 text-2xl font-bold">
            {streak > 0 ? `🔥 ${streak}-day streak` : 'Let’s begin'}
          </div>
          <div className="text-sm text-slate-400">
            {today.count > 0 ? `Today · ${today.count} done · ${today.minutes} min` : 'Nothing logged yet today'}
          </div>
        </div>
        <Link to="/settings" className="rounded-full bg-ink-700/60 p-2 text-lg">⚙️</Link>
      </header>

      {ordered.map((group) => {
        const list = active.filter((h) => h.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder);
        if (list.length === 0) return null;
        return (
          <section key={group.id}>
            <h2 className="label mb-2 flex items-center gap-2">
              <span className="text-base">{group.emoji}</span> {group.name}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((h) => (
                <HabitRow key={h.id} habit={h} doneChips={today.doneChips} onStart={start} />
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
              <HabitRow key={h.id} habit={h} doneChips={today.doneChips} onStart={start} />
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && (
        <p className="py-8 text-center text-slate-500">No habits yet — add your first one below.</p>
      )}

      <div className="grid grid-cols-2 gap-3 pt-2">
        <Link to="/quick" className="btn-accent">⚡ Quick Timer</Link>
        <Link to="/habits/new" className="btn-ghost">＋ Habit</Link>
      </div>
    </div>
  );
}

function HabitRow({
  habit,
  doneChips,
  onStart,
}: {
  habit: Habit;
  doneChips: Set<string>;
  onStart: (h: Habit, min: number) => void;
}) {
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg">{habit.emoji}</span>
          <span className="truncate font-semibold">{habit.name}</span>
        </div>
        <Link to={`/habits/${habit.id}`} className="shrink-0 text-xs text-slate-500 hover:text-slate-300">edit</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {habit.durations.map((min) => {
          const done = doneChips.has(`${habit.id}:${min}`);
          return (
            <button
              key={min}
              onClick={() => onStart(habit, min)}
              className={`chip ${done ? 'chip-done' : ''} ${min === habit.defaultDurationMin && !done ? 'border-accent/50' : ''}`}
            >
              {done ? '✓ ' : ''}{min}
            </button>
          );
        })}
      </div>
      {habit.note && <div className="mt-2 text-xs text-slate-500">· {habit.note}</div>}
    </div>
  );
}
