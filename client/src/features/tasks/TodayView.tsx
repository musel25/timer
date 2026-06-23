import { useState } from 'react';
import { useTasks, useSessions, useSaveTask, useCalendarEvents, useRestDays, useToggleRestDay } from '../../lib/hooks';
import { eventsByDay } from '../../lib/calendar';
import { EventChip } from '../../components/EventChip';
import type { Task } from '../../lib/types';
import { currentStreak, todaySummary } from '../../lib/stats';
import { Flame, Timer as TimerIcon, Clock, Moon } from 'lucide-react';
import { todayKey, addDaysKey } from '../../lib/date';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

export function TodayView() {
  const { data: tasks = [] } = useTasks();
  const { data: sessions = [] } = useSessions();
  const { data: restDayRows = [] } = useRestDays();
  const saveTask = useSaveTask();
  const toggleRest = useToggleRestDay();
  const [editing, setEditing] = useState<Task | null>(null);
  const [showHiddenTasks, setShowHiddenTasks] = useState(false);

  const tk = todayKey();
  const yk = addDaysKey(tk, -1);
  const { data: events = [] } = useCalendarEvents(tk, tk);
  const todayEvents = eventsByDay(events).get(tk) ?? [];
  const todays = tasks.filter((t) => t.date === tk).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);
  const today = todays.filter((t) => t.hiddenOn !== tk);
  const hiddenTasks = todays.filter((t) => t.hiddenOn === tk);
  const restDays = new Set(restDayRows.map((r) => r.date));
  const restingToday = restDays.has(tk);
  const restingYesterday = restDays.has(yk);
  const streak = currentStreak(sessions, undefined, restDays);
  const summary = todaySummary(sessions);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const hideTask = (t: Task) => saveTask.mutate({ id: t.id, hiddenOn: tk });
  const unhideTask = (t: Task) => saveTask.mutate({ id: t.id, hiddenOn: null });

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
          <button
            onClick={() => toggleRest.mutate({ date: tk, on: !restingToday })}
            className="stat-pill transition hover:opacity-80"
            style={restingToday ? { color: 'rgb(124 92 246)' } : undefined}
            title="Excuse today from streaks — a rest day bridges them instead of breaking them"
          >
            <Moon size={15} /> {restingToday ? 'Resting today' : 'Rest day'}
          </button>
          <button
            onClick={() => toggleRest.mutate({ date: yk, on: !restingYesterday })}
            className="text-xs text-slate-500 transition hover:text-slate-300"
            title="Excuse yesterday from streaks"
          >
            {restingYesterday ? 'Yesterday: resting' : 'Mark yesterday'}
          </button>
        </div>
      </header>

      <section className="card p-5">
        <h2 className="label mb-3">Tasks</h2>
        {todayEvents.length > 0 && (
          <div className="mb-3 space-y-1">
            {todayEvents.map((e) => <EventChip key={e.id} event={e} />)}
          </div>
        )}
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
                    <span className="min-w-0 flex-1 break-words text-sm text-slate-400">{t.title}</span>
                    <button onClick={() => unhideTask(t)} className="shrink-0 text-xs text-accent hover:underline">Unhide</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-3"><QuickAdd date={tk} placeholder="Add a task to today…" /></div>
      </section>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
