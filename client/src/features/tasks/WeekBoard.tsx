import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useTasks, useSaveTask, useToggleTask } from '../../lib/hooks';
import type { Task } from '../../lib/types';
import { weekDays, todayKey, addDaysKey, keyToDate } from '../../lib/date';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

const INBOX = 'inbox';

function DraggableTask({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const toggle = useToggleTask();
  // The whole card is the drag source; the checkbox and title stop pointer
  // propagation so a tap toggles/edits instead of starting a drag.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab items-start gap-2 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-2 text-sm shadow-sm transition active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
        className={`mt-0.5 h-[17px] w-[17px] shrink-0 rounded border-[1.5px] ${task.done ? 'border-transparent bg-accent' : 'border-ink-500 hover:border-accent'}`}
      >
        {task.done && <Check size={13} strokeWidth={3} className="mx-auto text-white" />}
      </button>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onEdit(task)}
        className={`min-w-0 flex-1 break-words text-left leading-snug ${task.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
      >
        {task.title}
      </button>
    </div>
  );
}

function DropColumn({ id, children, layout = 'space-y-1.5' }: { id: string; children: React.ReactNode; layout?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[40px] flex-1 rounded-lg p-1 transition ${layout} ${isOver ? 'bg-accent-soft ring-1 ring-accent/40' : ''}`}
    >
      {children}
    </div>
  );
}

function DayColumn({ dayKey, tasks, onEdit }: { dayKey: string; tasks: Task[]; onEdit: (t: Task) => void }) {
  const d = keyToDate(dayKey);
  const isToday = dayKey === todayKey();
  return (
    <div
      className={`card flex flex-col p-3 ${isToday ? 'ring-1 ring-accent/50' : ''}`}
      style={isToday ? { backgroundImage: 'linear-gradient(160deg, rgb(var(--accent) / 0.14), transparent 65%)' } : undefined}
    >
      <div className={`mb-2 flex items-baseline justify-between px-1 ${isToday ? 'text-accent' : 'text-slate-400'}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span className="text-lg font-bold">{d.getDate()}</span>
      </div>
      <DropColumn id={dayKey}>
        {tasks.map((t) => <DraggableTask key={t.id} task={t} onEdit={onEdit} />)}
      </DropColumn>
      <div className="mt-2"><QuickAdd date={dayKey} placeholder="Add task" compact /></div>
    </div>
  );
}

export function WeekBoard() {
  const { data: tasks = [] } = useTasks();
  const save = useSaveTask();
  const [anchor, setAnchor] = useState(todayKey());
  const [editing, setEditing] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Always Monday-first here so the 2×4 board reads Mon–Thu / Fri–Sun + Inbox.
  const days = weekDays(anchor, 1);
  const inbox = tasks.filter((t) => t.date === null && !t.done);
  const byDateMap = new Map<string, Task[]>();
  for (const t of tasks) if (t.date) { const arr = byDateMap.get(t.date) ?? []; arr.push(t); byDateMap.set(t.date, arr); }
  const byDate = (key: string) => (byDateMap.get(key) ?? []).slice().sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const date = over === INBOX ? null : over;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.date !== date) save.mutate({ id: taskId, date });
  }

  return (
    <div className="space-y-4">
      <header className="hero flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold md:text-4xl">Week</h1>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, -7))}><ChevronLeft size={16} /></button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(todayKey())}>This week</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, 7))}><ChevronRight size={16} /></button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {/* 2×4 board: Mon–Thu on the first row, Fri/Sat/Sun + Inbox on the second. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {days.map((key) => <DayColumn key={key} dayKey={key} tasks={byDate(key)} onEdit={setEditing} />)}

          <div className="card flex flex-col p-3">
            <div className="mb-2 flex items-baseline justify-between px-1 text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wide">Inbox</span>
              {inbox.length > 0 && <span className="text-lg font-bold">{inbox.length}</span>}
            </div>
            <DropColumn id={INBOX}>
              {inbox.map((t) => <DraggableTask key={t.id} task={t} onEdit={setEditing} />)}
              {inbox.length === 0 && <p className="px-1 py-2 text-sm text-slate-500">Drop undated tasks here.</p>}
            </DropColumn>
            <div className="mt-2"><QuickAdd date={null} placeholder="Capture a task…" compact /></div>
          </div>
        </div>
      </DndContext>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
