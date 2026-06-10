import { useState } from 'react';
import { useTasks, useHabits, useSessions, useSettings, useSaveTask, useSaveHabit } from '../../lib/hooks';
import type { Habit, Task } from '../../lib/types';
import { currentStreak, todaySummary } from '../../lib/stats';
import { Flame, Timer as TimerIcon, Clock } from 'lucide-react';
import { todayKey } from '../../lib/date';
import { HabitIcon } from '../../lib/habitIcons';
import { useRun } from '../run/RunContext';
import { HabitCard } from '../habits/HabitCard';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

export function TodayView() {
  const { data: tasks = [] } = useTasks();
  const { data: habits = [] } = useHabits();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { startRun } = useRun();
  const saveTask = useSaveTask();
  const saveHabit = useSaveHabit();
  const [editing, setEditing] = useState<Task | null>(null);
  const [showHiddenTasks, setShowHiddenTasks] = useState(false);
  const [showHiddenHabits, setShowHiddenHabits] = useState(false);

  const tk = todayKey();
  const todays = tasks.filter((t) => t.date === tk).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);
  const today = todays.filter((t) => t.hiddenOn !== tk);
  const hiddenTasks = todays.filter((t) => t.hiddenOn === tk);
  const streak = currentStreak(sessions);
  const summary = todaySummary(sessions);
  const notArchived = habits.filter((h) => !h.archived);
  const active = notArchived.filter((h) => h.hiddenOn !== tk);
  const hiddenHabits = notArchived.filter((h) => h.hiddenOn === tk);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function startHabit(habit: Habit, min: number) {
    const prep = settings?.prepSeconds ?? 5;
    startRun({ type: 'simple', label: habit.name, habitId: habit.id, plannedSeconds: min * 60, config: { totalSeconds: min * 60, prepSeconds: prep } });
  }

  const hideTask = (t: Task) => saveTask.mutate({ id: t.id, hiddenOn: tk });
  const unhideTask = (t: Task) => saveTask.mutate({ id: t.id, hiddenOn: null });
  const hideHabit = (h: Habit) => saveHabit.mutate({ id: h.id, hiddenOn: tk });
  const unhideHabit = (h: Habit) => saveHabit.mutate({ id: h.id, hiddenOn: null });

  return (
    <div className="space-y-6">
      <header className="hero">
        <div className="text-sm font-medium text-slate-300">{dateLabel}</div>
        <h1 className="mt-0.5 text-3xl font-bold md:text-4xl">Today</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="stat-pill" style={{ color: 'rgb(217 144 30)' }}>
            <Flame size={15} /> {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
          </span>
          <span className="stat-pill" style={{ color: 'rgb(58 109 240)' }}>
            <TimerIcon size={15} /> {summary.count} session{summary.count === 1 ? '' : 's'}
          </span>
          <span className="stat-pill" style={{ color: 'rgb(124 92 246)' }}>
            <Clock size={15} /> {summary.minutes} min
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1">
          <h2 className="label mb-3">Tasks</h2>
          <div className="divide-y divide-ink-600">
            {today.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} onHide={hideTask} />)}
          </div>
          {today.length === 0 && <p className="py-3 text-sm text-slate-500">Nothing scheduled for today.</p>}
          {hiddenTasks.length > 0 && (
            <div className="mt-2 border-t border-ink-600 pt-2">
              <button onClick={() => setShowHiddenTasks((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300">
                {showHiddenTasks ? 'Hide' : 'Show'} {hiddenTasks.length} hidden for today
              </button>
              {showHiddenTasks && (
                <div className="mt-1 space-y-1">
                  {hiddenTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-1 opacity-60">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-400">{t.title}</span>
                      <button onClick={() => unhideTask(t)} className="shrink-0 text-xs text-accent hover:underline">Unhide</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-3"><QuickAdd date={tk} placeholder="Add a task to today…" /></div>
        </section>

        {notArchived.length > 0 && (
          <section className="lg:col-span-2">
            <h2 className="label mb-3">Habits</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {active.map((h) => (
                <HabitCard key={h.id} habit={h} doneChips={summary.doneChips} onStart={startHabit} onHide={hideHabit} />
              ))}
            </div>
            {active.length === 0 && <p className="py-1 text-sm text-slate-500">All habits hidden for today.</p>}
            {hiddenHabits.length > 0 && (
              <div className="mt-3">
                <button onClick={() => setShowHiddenHabits((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300">
                  {showHiddenHabits ? 'Hide' : 'Show'} {hiddenHabits.length} hidden for today
                </button>
                {showHiddenHabits && (
                  <div className="mt-2 space-y-1">
                    {hiddenHabits.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 py-1 opacity-60">
                        <HabitIcon name={h.emoji} className="text-slate-300" size={20} />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-400">{h.name}</span>
                        <button onClick={() => unhideHabit(h)} className="shrink-0 text-xs text-accent hover:underline">Unhide</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
