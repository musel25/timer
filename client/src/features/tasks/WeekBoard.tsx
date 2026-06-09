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
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
        className={`h-4 w-4 shrink-0 rounded border-[1.5px] ${task.done ? 'border-transparent bg-accent' : 'border-ink-500'}`}
      >
        {task.done && <span className="block text-center text-[10px] leading-[14px] text-white">✓</span>}
      </button>
      <button onClick={() => onEdit(task)} className={`min-w-0 flex-1 truncate text-left text-[12.5px] ${task.done ? 'text-slate-500 line-through' : ''}`}>
        {task.title}
      </button>
      <span {...attributes} {...listeners} className="cursor-grab px-1 text-slate-400" aria-label="Drag">⠿</span>
    </div>
  );
}

function DropColumn({ id, children, highlight }: { id: string; children: React.ReactNode; highlight?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`min-h-[80px] space-y-1.5 rounded-xl p-1.5 transition ${isOver ? 'bg-accent-soft' : highlight ? 'bg-ink-700/60' : ''}`}>
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
  const byDate = (key: string) => tasks.filter((t) => t.date === key).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);

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
        <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
          <div className="card p-3">
            <h2 className="label mb-2">Inbox</h2>
            <DropColumn id={INBOX} highlight>
              {inbox.map((t) => <DraggableTask key={t.id} task={t} onEdit={setEditing} />)}
            </DropColumn>
            <div className="mt-2"><QuickAdd date={null} placeholder="Capture…" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {days.map((key) => {
              const d = keyToDate(key);
              const isToday = key === todayKey();
              return (
                <div key={key} className="card p-2">
                  <div className={`mb-1 px-1 text-xs font-semibold ${isToday ? 'text-accent' : 'text-slate-400'}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
                  </div>
                  <DropColumn id={key}>
                    {byDate(key).map((t) => <DraggableTask key={t.id} task={t} onEdit={setEditing} />)}
                  </DropColumn>
                  <div className="mt-1"><QuickAdd date={key} placeholder="＋" /></div>
                </div>
              );
            })}
          </div>
        </div>
      </DndContext>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
