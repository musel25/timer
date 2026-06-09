import { useState } from 'react';
import { useTasks, useSettings } from '../../lib/hooks';
import type { Task } from '../../lib/types';
import { monthMatrix, monthLabel, isSameMonth, todayKey, keyToDate } from '../../lib/date';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthCalendar() {
  const { data: tasks = [] } = useTasks();
  const { data: settings } = useSettings();
  const weekStart = settings?.weekStart ?? 1;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selected, setSelected] = useState<string>(todayKey());
  const [editing, setEditing] = useState<Task | null>(null);

  const weeks = monthMatrix(year, month0, weekStart);
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) if (t.date) (byDate.get(t.date) ?? byDate.set(t.date, []).get(t.date)!).push(t);
  const dow = Array.from({ length: 7 }, (_, i) => DOW[(weekStart + i) % 7]);
  const selectedTasks = (byDate.get(selected) ?? []).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);

  function shift(delta: number) {
    const m = month0 + delta;
    const y = year + Math.floor(m / 12);
    setYear(y); setMonth0(((m % 12) + 12) % 12);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-bold">{monthLabel(year, month0)}</h1>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-1.5" onClick={() => shift(-1)}>‹</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => { setYear(now.getFullYear()); setMonth0(now.getMonth()); setSelected(todayKey()); }}>Today</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => shift(1)}>›</button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-3">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
            {dow.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((key) => {
              const inMonth = isSameMonth(key, year, month0);
              const isToday = key === todayKey();
              const isSel = key === selected;
              const dayTasks = byDate.get(key) ?? [];
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`flex min-h-[58px] flex-col rounded-lg border p-1.5 text-left transition ${
                    isSel ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-ink-700'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span className={`text-[11px] font-semibold ${isToday ? 'text-accent' : 'text-slate-300'}`}>{keyToDate(key).getDate()}</span>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {dayTasks.slice(0, 3).map((t) => (
                      <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${t.done ? 'bg-ink-500' : 'bg-accent'}`} />
                    ))}
                    {dayTasks.length > 3 && <span className="text-[9px] text-slate-400">+{dayTasks.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="label mb-2">{keyToDate(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          <div className="divide-y divide-ink-600">
            {selectedTasks.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
          </div>
          {selectedTasks.length === 0 && <p className="py-3 text-sm text-slate-500">No tasks this day.</p>}
          <div className="mt-2"><QuickAdd date={selected} placeholder="Add a task…" /></div>
        </div>
      </div>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
