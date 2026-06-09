import { useState } from 'react';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useTasks, useSettings, useSaveTask, useToggleTask } from '../../lib/hooks';
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
      className={`flex cursor-grab items-start gap-2 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs shadow-sm transition active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
        className={`mt-px h-[15px] w-[15px] shrink-0 rounded border-[1.5px] ${task.done ? 'border-transparent bg-accent' : 'border-ink-500 hover:border-accent'}`}
      >
        {task.done && <span className="block text-center text-[9px] leading-[12px] text-white">✓</span>}
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

function DropColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[40px] space-y-1.5 rounded-lg p-1 transition ${isOver ? 'bg-accent-soft ring-1 ring-accent/40' : ''}`}
    >
      {children}
    </div>
  );
}

export function WeekBoard() {
  const { data: tasks = [] } = useTasks();
  const { data: settings } = useSettings();
  const save = useSaveTask();
  const weekStart = settings?.weekStart ?? 1;
  const [anchor, setAnchor] = useState(todayKey());
  const [editing, setEditing] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = weekDays(anchor, weekStart);
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
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-bold">Week</h1>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, -7))}>‹</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(todayKey())}>This week</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, 7))}>›</button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {/* Comfortable fixed-width columns; the board scrolls horizontally so
            titles stay readable instead of wrapping in cramped columns. */}
        <div className="flex gap-3 overflow-x-auto pb-3">
          <div className="card flex w-[208px] shrink-0 flex-col p-3">
            <h2 className="label mb-2 flex items-center justify-between">
              Inbox
              {inbox.length > 0 && <span className="text-slate-500">{inbox.length}</span>}
            </h2>
            <DropColumn id={INBOX}>
              {inbox.map((t) => <DraggableTask key={t.id} task={t} onEdit={setEditing} />)}
              {inbox.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">Drop undated tasks here.</p>}
            </DropColumn>
            <div className="mt-2"><QuickAdd date={null} placeholder="Capture a task…" compact /></div>
          </div>

          {days.map((key) => {
            const d = keyToDate(key);
            const isToday = key === todayKey();
            const list = byDate(key);
            return (
              <div key={key} className={`card flex w-[164px] shrink-0 flex-col p-2 ${isToday ? 'ring-1 ring-accent/50' : ''}`}>
                <div className={`mb-1.5 flex items-baseline justify-between px-1 ${isToday ? 'text-accent' : 'text-slate-400'}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wide">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="text-sm font-bold">{d.getDate()}</span>
                </div>
                <DropColumn id={key}>
                  {list.map((t) => <DraggableTask key={t.id} task={t} onEdit={setEditing} />)}
                </DropColumn>
                <div className="mt-1.5"><QuickAdd date={key} placeholder="Add task" compact /></div>
              </div>
            );
          })}
        </div>
      </DndContext>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
