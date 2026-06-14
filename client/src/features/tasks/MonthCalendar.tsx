import { useState } from 'react';
import { useTasks, useSettings, useCalendarEvents } from '../../lib/hooks';
import type { Task } from '../../lib/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthMatrix, monthLabel, isSameMonth, todayKey, keyToDate } from '../../lib/date';
import { eventsByDay } from '../../lib/calendar';
import { EventChip } from '../../components/EventChip';
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
  const cells = weeks.flat();
  // Pull Google Calendar events across the whole visible grid (incl. spill-over days).
  const { data: events = [] } = useCalendarEvents(cells[0], cells[cells.length - 1]);
  const evByDay = eventsByDay(events);
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) if (t.date) (byDate.get(t.date) ?? byDate.set(t.date, []).get(t.date)!).push(t);
  const dow = Array.from({ length: 7 }, (_, i) => DOW[(weekStart + i) % 7]);
  const selectedTasks = (byDate.get(selected) ?? []).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);
  const selectedEvents = evByDay.get(selected) ?? [];

  function shift(delta: number) {
    const m = month0 + delta;
    const y = year + Math.floor(m / 12);
    setYear(y); setMonth0(((m % 12) + 12) % 12);
  }

  return (
    <div className="space-y-6">
      <header className="hero flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold md:text-4xl">{monthLabel(year, month0)}</h1>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-1.5" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => { const d = new Date(); setYear(d.getFullYear()); setMonth0(d.getMonth()); setSelected(todayKey()); }}>Today</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => shift(1)}><ChevronRight size={16} /></button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-4">
          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
            {dow.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((key) => {
              const inMonth = isSameMonth(key, year, month0);
              const isToday = key === todayKey();
              const isSel = key === selected;
              const dayTasks = byDate.get(key) ?? [];
              const dayEvents = evByDay.get(key) ?? [];
              // sm+ cells fit ~3 lines: show events first (calendar), then tasks.
              const evShown = dayEvents.slice(0, 2);
              const taskShown = dayTasks.slice(0, Math.max(0, 3 - evShown.length));
              const overflow = dayTasks.length + dayEvents.length - evShown.length - taskShown.length;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition sm:min-h-[88px] ${
                    isSel ? 'border-accent bg-accent-soft' : isToday ? 'border-accent/40' : 'border-transparent hover:bg-ink-700'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span className={`text-sm font-semibold ${isToday ? 'text-accent' : 'text-slate-300'}`}>{keyToDate(key).getDate()}</span>
                  {/* Phones get dots; from sm up the cells are tall enough for titles. */}
                  <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span key={e.id} className="h-2 w-2 rounded-full bg-slate-400" />
                    ))}
                    {dayTasks.slice(0, 4).map((t) => (
                      <span key={t.id} className={`h-2 w-2 rounded-full ${t.done ? 'bg-ink-500' : 'bg-accent'}`} />
                    ))}
                  </div>
                  <div className="mt-1 hidden w-full flex-col gap-0.5 sm:flex">
                    {evShown.map((e) => (
                      <span
                        key={e.id}
                        className="truncate rounded px-1 py-px text-[11px] leading-snug bg-ink-700/70 text-slate-300 ring-1 ring-ink-500/60"
                      >
                        {e.title}
                      </span>
                    ))}
                    {taskShown.map((t) => (
                      <span
                        key={t.id}
                        className={`truncate rounded px-1 py-px text-[11px] leading-snug ${
                          t.done ? 'bg-ink-700/60 text-slate-500 line-through' : 'bg-accent-soft text-slate-200'
                        }`}
                      >
                        {t.title}
                      </span>
                    ))}
                    {overflow > 0 && <span className="px-1 text-[10px] text-slate-400">+{overflow} more</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="label mb-2">{keyToDate(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          {selectedEvents.length > 0 && (
            <div className="mb-3 space-y-1">
              {selectedEvents.map((e) => <EventChip key={e.id} event={e} />)}
            </div>
          )}
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
