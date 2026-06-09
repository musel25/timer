import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTasks, useHabits, useSessions, useSettings } from '../../lib/hooks';
import type { Habit, Task } from '../../lib/types';
import { currentStreak, todaySummary } from '../../lib/stats';
import { todayKey } from '../../lib/date';
import { useRun } from '../run/RunContext';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

export function TodayView() {
  const { data: tasks = [] } = useTasks();
  const { data: habits = [] } = useHabits();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { startRun } = useRun();
  const [editing, setEditing] = useState<Task | null>(null);

  const tk = todayKey();
  const today = tasks.filter((t) => t.date === tk).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);
  const streak = currentStreak(sessions);
  const summary = todaySummary(sessions);
  const active = habits.filter((h) => !h.archived);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function startHabit(habit: Habit, min: number) {
    const prep = settings?.prepSeconds ?? 5;
    startRun({ type: 'simple', label: habit.name, habitId: habit.id, plannedSeconds: min * 60, config: { totalSeconds: min * 60, prepSeconds: prep } });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="pt-1">
        <div className="text-sm text-slate-400">{dateLabel}</div>
        <h1 className="text-2xl font-bold">Today</h1>
        <div className="text-sm text-slate-400">
          {streak > 0 ? `🔥 ${streak}-day streak` : "Let's begin"}
          {summary.count > 0 ? ` · ${summary.count} session${summary.count > 1 ? 's' : ''} · ${summary.minutes} min` : ''}
        </div>
      </header>

      <section className="card p-4">
        <h2 className="label mb-2">Tasks</h2>
        <div className="divide-y divide-ink-600">
          {today.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
        </div>
        {today.length === 0 && <p className="py-3 text-sm text-slate-500">Nothing scheduled for today.</p>}
        <div className="mt-2"><QuickAdd date={tk} placeholder="Add a task to today…" /></div>
      </section>

      {active.length > 0 && (
        <section className="card p-4">
          <h2 className="label mb-2">Habits</h2>
          <div className="space-y-1">
            {active.map((h) => (
              <div key={h.id} className="flex items-center gap-2 py-1.5">
                <span className="text-lg">{h.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {h.durations.map((min) => {
                    const done = summary.doneChips.has(`${h.id}:${min}`);
                    return (
                      <button key={min} onClick={() => startHabit(h, min)} className={`chip ${done ? 'chip-done' : ''}`}>
                        {done ? '✓ ' : ''}{min}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/focus" className="btn-accent">🍅 Focus</Link>
        <Link to="/quick" className="btn-ghost">⚡ Quick Timer</Link>
      </div>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
