import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, Flame, Timer as TimerIcon, Clock } from 'lucide-react';
import { DndContext, closestCorners, useDroppable, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks, useSaveTask, useToggleTask, useReorderTasks, useCalendarEvents, useSessions, useRestDays } from '../../lib/hooks';
import { isArchived } from '../../lib/archive';
import { columnOrder, moveWithin, numberOf } from '../../lib/order';
import type { CalendarEvent, Task } from '../../lib/types';
import { currentStreak, todaySummary } from '../../lib/stats';
import { eventsByDay } from '../../lib/calendar';
import { EventChip } from '../../components/EventChip';
import { weekDays, todayKey, addDaysKey, keyToDate } from '../../lib/date';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

const INBOX = 'inbox';

function DraggableTask({ task, index, onEdit, dragHappened, onArchive }: { task: Task; index: number | null; onEdit: (t: Task) => void; dragHappened: React.MutableRefObject<boolean>; onArchive?: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const toggle = useToggleTask();
  // The whole card is the drag source, checkbox and title included — the
  // sensors' activation constraints (mouse distance, touch long-press) mean a
  // plain tap still clicks. After a real drag, `dragHappened` swallows the
  // click that fires on pointer-up. touch-manipulation keeps the browser from
  // eating the long-press for double-tap-zoom before the TouchSensor sees it.
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab touch-manipulation items-start gap-1.5 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-2 text-sm shadow-sm transition active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {/* Position in the column. Done tasks leave the gutter empty — the
          checkbox already says it, and blanking it keeps 1..n gapless. */}
      <span className="mt-px w-3 shrink-0 text-right text-[11px] font-semibold leading-[19px] tabular-nums text-slate-500">
        {index ?? ''}
      </span>
      <button
        onClick={() => { if (!dragHappened.current) toggle.mutate({ id: task.id, done: !task.done }); }}
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
        className={`mt-0.5 h-[17px] w-[17px] shrink-0 rounded border-[1.5px] ${task.done ? 'border-transparent bg-accent' : 'border-ink-500 hover:border-accent'}`}
      >
        {task.done && <Check size={13} strokeWidth={3} className="mx-auto text-white" />}
      </button>
      <button
        onClick={() => { if (!dragHappened.current) onEdit(task); }}
        className={`min-w-0 flex-1 break-words text-left leading-snug ${task.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
      >
        {task.title}
      </button>
      {/* Same dragHappened guard as the checkbox — a drag must not archive. */}
      {onArchive && (
        <button
          onClick={() => { if (!dragHappened.current) onArchive(task); }}
          aria-label="Archive task"
          title="Archive (hide, keep)"
          className="-mr-1 mt-0.5 shrink-0 rounded p-0.5 text-slate-500 transition hover:bg-ink-700 hover:text-slate-200"
        >
          <Archive size={14} />
        </button>
      )}
    </div>
  );
}

/** Archived tasks are read-only: no drag, no checkbox, just restore or open. */
function ArchivedTask({ task, onEdit, onRestore }: { task: Task; onEdit: (t: Task) => void; onRestore: (t: Task) => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-2.5 py-2 text-sm opacity-70">
      <button
        onClick={() => onEdit(task)}
        className="min-w-0 flex-1 break-words text-left leading-snug text-slate-300"
      >
        {task.title}
      </button>
      <button
        onClick={() => onRestore(task)}
        aria-label="Move back to Inbox"
        title="Move back to Inbox"
        className="-mr-1 mt-0.5 shrink-0 rounded p-0.5 text-slate-500 transition hover:bg-ink-700 hover:text-slate-200"
      >
        <ArchiveRestore size={14} />
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

function DayColumn({ dayKey, tasks, events, onEdit, dragHappened }: { dayKey: string; tasks: Task[]; events: CalendarEvent[]; onEdit: (t: Task) => void; dragHappened: React.MutableRefObject<boolean> }) {
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
      {events.length > 0 && (
        <div className="mb-1.5 space-y-1 px-1">
          {events.map((e) => <EventChip key={e.id} event={e} />)}
        </div>
      )}
      <DropColumn id={dayKey}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <DraggableTask key={t.id} task={t} index={numberOf(tasks, t)} onEdit={onEdit} dragHappened={dragHappened} />
          ))}
        </SortableContext>
      </DropColumn>
      <div className="mt-2"><QuickAdd date={dayKey} placeholder="Add task" compact /></div>
    </div>
  );
}

export function WeekBoard() {
  const { data: tasks = [] } = useTasks();
  const { data: sessions = [] } = useSessions();
  const { data: restDayRows = [] } = useRestDays();
  const save = useSaveTask();
  const reorder = useReorderTasks();
  const [anchor, setAnchor] = useState(todayKey());
  const streak = currentStreak(sessions, undefined, new Set(restDayRows.map((r) => r.date)));
  const summary = todaySummary(sessions);
  const [editing, setEditing] = useState<Task | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  // Mouse and touch need opposite activation rules. A mouse tap lands within a
  // couple of px, so distance works; a fingertip rolls 5px on a plain tap, so a
  // distance-based sensor turns taps into drags and the click never fires. On
  // touch, drag is long-press (tolerance is finger wobble allowed during it).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  // True while a drag is in flight; cleared a tick after drop so the click
  // that follows pointer-up doesn't toggle/edit the dragged task.
  const dragHappened = useRef(false);

  // Always Monday-first here so the 2×4 board reads Mon–Thu / Fri–Sun + Inbox.
  const days = weekDays(anchor, 1);
  const { data: events = [] } = useCalendarEvents(days[0], days[6]);
  const evByDay = eventsByDay(events);
  // Archived tasks leave the board entirely — Inbox and day columns alike —
  // until you open the archive. Newest-archived first once you do.
  const inbox = columnOrder(tasks.filter((t) => t.date === null && !t.done && !isArchived(t)));
  const archived = tasks
    .filter((t) => isArchived(t))
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  // Falls back to the Inbox on its own once the archive empties out, so
  // restoring the last task can't strand you on a blank column.
  const inArchive = showArchive && archived.length > 0;
  const byDateMap = new Map<string, Task[]>();
  for (const t of tasks) if (t.date && !isArchived(t)) { const arr = byDateMap.get(t.date) ?? []; arr.push(t); byDateMap.set(t.date, arr); }
  const byDate = (key: string) => columnOrder(byDateMap.get(key) ?? []);

  // Every column the board can drop onto, keyed the same way the droppables are.
  const columns = new Map<string, Task[]>([[INBOX, inbox], ...days.map((k) => [k, byDate(k)] as const)]);
  const columnOfTask = new Map<string, string>();
  for (const [col, list] of columns) for (const t of list) columnOfTask.set(t.id, col);

  function clearDragSoon() {
    setTimeout(() => { dragHappened.current = false; }, 0);
  }

  function onDragEnd(e: DragEndEvent) {
    clearDragSoon();
    const taskId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    // `over` is either another card or the column itself (empty column, or the
    // padding below the last card) — the latter means "put it at the end".
    const toCol = columns.has(overId) ? overId : columnOfTask.get(overId);
    if (!toCol) return;
    const date = toCol === INBOX ? null : toCol;

    const ids = (columns.get(toCol) ?? []).map((t) => t.id);
    if (columnOfTask.get(taskId) === toCol) {
      const from = ids.indexOf(taskId);
      const to = columns.has(overId) ? ids.length - 1 : ids.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;
      reorder.mutate({ date, ids: moveWithin(ids, from, to) });
    } else {
      const at = columns.has(overId) ? ids.length : ids.indexOf(overId);
      ids.splice(at < 0 ? ids.length : at, 0, taskId);
      reorder.mutate({ date, ids });
    }
  }

  return (
    <div className="space-y-4">
      <header className="hero flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Week</h1>
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
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, -7))}><ChevronLeft size={16} /></button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(todayKey())}>This week</button>
          <button className="btn-ghost px-3 py-1.5" onClick={() => setAnchor(addDaysKey(anchor, 7))}><ChevronRight size={16} /></button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={() => { dragHappened.current = true; }}
        onDragCancel={clearDragSoon}
        onDragEnd={onDragEnd}
      >
        {/* 2×4 board: Mon–Thu on the first row, Fri/Sat/Sun + Inbox on the second. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {days.map((key) => <DayColumn key={key} dayKey={key} tasks={byDate(key)} events={evByDay.get(key) ?? []} onEdit={setEditing} dragHappened={dragHappened} />)}

          <div className="card flex flex-col p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1 text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wide">
                {inArchive ? 'Archived' : 'Inbox'}
              </span>
              <span className="flex items-baseline gap-2">
                {/* Only appears once something is archived, so it stays invisible
                    until it's earned. */}
                {archived.length > 0 && (
                  <button
                    onClick={() => setShowArchive(!inArchive)}
                    title={inArchive ? 'Back to the Inbox' : 'Show archived tasks'}
                    className={`flex items-center gap-1 self-center rounded px-1.5 py-0.5 text-xs font-semibold transition hover:bg-ink-700 ${inArchive ? 'text-accent' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Archive size={12} /> {archived.length}
                  </button>
                )}
                {!inArchive && inbox.length > 0 && <span className="text-lg font-bold">{inbox.length}</span>}
              </span>
            </div>
            {inArchive ? (
              // Not a drop target: you restore an archived task, you don't drag onto it.
              <div className="min-h-[40px] flex-1 space-y-1.5 p-1">
                {archived.map((t) => (
                  <ArchivedTask
                    key={t.id}
                    task={t}
                    onEdit={setEditing}
                    onRestore={(task) => save.mutate({ id: task.id, archivedAt: null })}
                  />
                ))}
              </div>
            ) : (
              <>
                <DropColumn id={INBOX}>
                  <SortableContext items={inbox.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {inbox.map((t) => (
                      <DraggableTask
                        key={t.id}
                        task={t}
                        index={numberOf(inbox, t)}
                        onEdit={setEditing}
                        dragHappened={dragHappened}
                        onArchive={(task) => save.mutate({ id: task.id, archivedAt: Date.now() })}
                      />
                    ))}
                  </SortableContext>
                  {inbox.length === 0 && <p className="px-1 py-2 text-sm text-slate-500">Drop undated tasks here.</p>}
                </DropColumn>
                <div className="mt-2"><QuickAdd date={null} placeholder="Capture a task…" compact /></div>
              </>
            )}
          </div>
        </div>
      </DndContext>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
