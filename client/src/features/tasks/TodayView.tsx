import { useState } from 'react';
import { useTasks, useHabits, useSessions, useSettings, useSaveTask, useSaveHabit } from '../../lib/hooks';
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
        <div className="mt-2"><QuickAdd date={tk} placeholder="Add a task to today…" /></div>
      </section>

      {notArchived.length > 0 && (
        <section className="card p-4">
          <h2 className="label mb-2">Habits</h2>
          <div className="space-y-1">
            {active.map((h) => (
              <div key={h.id} className="group flex items-center gap-2 py-1.5">
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
                <button
                  aria-label="Hide from today"
                  title="Hide from today"
                  onClick={() => hideHabit(h)}
                  className="shrink-0 text-slate-500 opacity-0 transition hover:text-slate-200 group-hover:opacity-100"
                >
                  🙈
                </button>
              </div>
            ))}
          </div>
          {active.length === 0 && <p className="py-1 text-sm text-slate-500">All habits hidden for today.</p>}
          {hiddenHabits.length > 0 && (
            <div className="mt-2 border-t border-ink-600 pt-2">
              <button onClick={() => setShowHiddenHabits((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300">
                {showHiddenHabits ? 'Hide' : 'Show'} {hiddenHabits.length} hidden for today
              </button>
              {showHiddenHabits && (
                <div className="mt-1 space-y-1">
                  {hiddenHabits.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 py-1 opacity-60">
                      <span className="text-lg">{h.emoji}</span>
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

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
