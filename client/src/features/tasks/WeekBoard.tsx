import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, Inbox, Repeat2 } from 'lucide-react';
import { DndContext, closestCorners, useDroppable, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks, useSaveTask, useToggleTask, useReorderTasks, useCalendarEvents } from '../../lib/hooks';
import { isArchived } from '../../lib/archive';
import { columnOrder, moveWithin, numberOf } from '../../lib/order';
import type { CalendarEvent, Task } from '../../lib/types';
import { eventsByDay } from '../../lib/calendar';
import { EventChip } from '../../components/EventChip';
import { weekDays, todayKey, addDaysKey, keyToDate } from '../../lib/date';
import { HabitPulse } from '../habits/HabitPulse';
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
      className={`task-card flex cursor-grab touch-manipulation items-start gap-1.5 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-2 text-sm shadow-sm transition active:cursor-grabbing ${
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
        className={`task-check mt-0.5 h-[18px] w-[17px] shrink-0 rounded border-[1.5px] ${task.done ? 'border-transparent bg-accent' : 'border-ink-500 hover:border-accent'}`}
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

function DayColumn({ dayKey, tasks, events, onEdit, dragHappened, showCompleted }: { dayKey: string; tasks: Task[]; events: CalendarEvent[]; onEdit: (t: Task) => void; dragHappened: React.MutableRefObject<boolean>; showCompleted: boolean }) {
  const d = keyToDate(dayKey);
  const isToday = dayKey === todayKey();
  return (
    <div
      className={`week-day ${isToday ? 'is-today' : ''}`}
    >
      <div className="day-date">
        <span className="day-name">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span className="day-number">{String(d.getDate()).padStart(2, '0')}</span>
        {isToday ? <span className="day-today">Today</span> : <span className="day-count">{tasks.filter((t) => !t.done).length} to do</span>}
      </div>
      <div className="day-tasks">
      {events.length > 0 && (
        <div className="mb-1.5 space-y-1 px-1">
          {events.map((e) => <EventChip key={e.id} event={e} />)}
        </div>
      )}
      <DropColumn id={dayKey} layout="day-task-list space-y-1.5">
        <SortableContext items={tasks.map((t) => t.id)} strategy={rectSortingStrategy}>
          {tasks.filter((t) => showCompleted || !t.done).map((t) => (
            <DraggableTask key={t.id} task={t} index={numberOf(tasks, t)} onEdit={onEdit} dragHappened={dragHappened} />
          ))}
        </SortableContext>
        {tasks.length === 0 && <p className="px-1 py-1 text-xs text-slate-500">No tasks planned</p>}
        {!showCompleted && tasks.length > 0 && tasks.every((task) => task.done) && <p className="px-1 py-1 text-xs text-slate-500">All tasks complete</p>}
      </DropColumn>
      <div className="mt-2"><QuickAdd date={dayKey} placeholder="Add task" compact /></div>
      </div>
    </div>
  );
}

export function WeekBoard() {
  const { data: tasks = [], isLoading, isError } = useTasks();
  const save = useSaveTask();
  const reorder = useReorderTasks();
  const [anchor, setAnchor] = useState(todayKey());
  const [editing, setEditing] = useState<Task | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'week' | 'inbox'>('week');
  // Mouse and touch need opposite activation rules. On touch, drag is
  // long-press (tolerance is finger wobble allowed during it); on mouse it is
  // distance — but the distance has to clear the drift of an ordinary click,
  // not just a twitch. The moment a sensor activates, dnd-kit stops the next
  // click dead at the document (capture-phase stopPropagation), so a threshold
  // a hand crosses on the way to ticking a 17px checkbox doesn't merely start a
  // stray drag: it eats the click outright, and the task never gets marked
  // done. 5px was under that drift, which silently swallowed clicks all day.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 12 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  // True while a drag is in flight; cleared a tick after drop so the click
  // that follows pointer-up doesn't toggle/edit the dragged task.
  const dragHappened = useRef(false);

  // Keep the planner Monday-first across every responsive layout.
  const days = weekDays(anchor, 1);
  const { data: events = [] } = useCalendarEvents(days[0], days[6]);
  const evByDay = eventsByDay(events);
  // Archived tasks leave the board entirely — Inbox and day columns alike —
  // until you open the archive. Newest-archived first once you do.
  const inbox = columnOrder(tasks.filter((t) => t.date === null && !isArchived(t)));
  const inboxOpen = inbox.filter((t) => !t.done).length;
  const archived = tasks
    .filter((t) => isArchived(t))
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  // Falls back to the Inbox on its own once the archive empties out, so
  // restoring the last task can't strand you on a blank column.
  const inArchive = showArchive && archived.length > 0;
  const byDateMap = new Map<string, Task[]>();
  for (const t of tasks) if (t.date && !isArchived(t)) { const arr = byDateMap.get(t.date) ?? []; arr.push(t); byDateMap.set(t.date, arr); }
  const byDate = (key: string) => columnOrder(byDateMap.get(key) ?? []);

  const weekTasks = days.flatMap(byDate);
  const completed = weekTasks.filter((t) => t.done).length;
  const dateLabel = (key: string, year = true) => keyToDate(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}) });

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
    <div className="week-workspace space-y-5">
      <header className="hero planner-heading flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="page-title">Your week</h1>
          <p className="mt-2 text-sm text-slate-400">A little structure. More room for what matters.</p>
        </div>
        <div className="week-navigation flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-800 p-1">
          <button className="btn px-2.5 py-2 hover:bg-ink-700" aria-label="Previous week" onClick={() => setAnchor(addDaysKey(anchor, -7))}><ChevronLeft size={16} /></button>
          <button className="btn px-3 py-2 hover:bg-ink-700" onClick={() => setAnchor(todayKey())}>This week</button>
          <button className="btn px-2.5 py-2 hover:bg-ink-700" aria-label="Next week" onClick={() => setAnchor(addDaysKey(anchor, 7))}><ChevronRight size={16} /></button>
        </div>
      </header>
      {!isLoading && !isError && <div className="week-toolbar">
        <div>
          <h2 className="week-range" aria-live="polite">{dateLabel(days[0], keyToDate(days[0]).getFullYear() !== keyToDate(days[6]).getFullYear())} – {dateLabel(days[6])}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>{weekTasks.length - completed} tasks left</span><span aria-hidden="true" className="summary-dot" /><span>{completed} of {weekTasks.length} completed</span></p>
        </div>
        <label className="completed-filter flex cursor-pointer items-center gap-2 text-xs text-slate-400"><input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--accent))]" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />Show completed</label>
      </div>}
      {isLoading && <p role="status" className="text-sm text-slate-400">Loading your week…</p>}
      {isError && <p role="alert" className="text-sm text-rose-400">Your tasks could not be loaded. Please refresh to try again.</p>}

      {!isLoading && !isError && <div className="planner-mobile-switch flex gap-1 rounded-lg border border-ink-600 bg-ink-800 p-1" aria-label="Planner view">
        <button type="button" aria-pressed={mobilePanel === 'week'} onClick={() => setMobilePanel('week')} className={`btn flex-1 py-2 ${mobilePanel === 'week' ? 'bg-accent-soft text-accent' : 'text-slate-400'}`}>Week</button>
        <button type="button" aria-pressed={mobilePanel === 'inbox'} onClick={() => setMobilePanel('inbox')} className={`btn flex-1 py-2 ${mobilePanel === 'inbox' ? 'bg-accent-soft text-accent' : 'text-slate-400'}`}>Inbox ({inboxOpen})</button>
      </div>}
      {!isLoading && !isError && <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={() => { dragHappened.current = true; }}
        onDragCancel={clearDragSoon}
        onDragEnd={onDragEnd}
      >
        {/* A seven-day agenda with a separate undated Inbox. */}
        <div className="planner-layout" data-mobile-panel={mobilePanel}>
          <div className="week-days">{days.map((key) => <DayColumn key={key} dayKey={key} tasks={byDate(key)} events={evByDay.get(key) ?? []} onEdit={setEditing} dragHappened={dragHappened} showCompleted={showCompleted} />)}</div>

          <aside className="planner-inbox space-y-5">
          <div className="inbox-panel card flex flex-col">
            <div className="inbox-heading flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2.5 text-sm font-bold"><span className="inbox-symbol"><Inbox size={17} /></span>{inArchive ? 'Archived' : 'Inbox'}</h2>
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
                {!inArchive && <span className="inbox-count">{inboxOpen}</span>}
              </span>
            </div>
            {!inArchive && <p className="inbox-caption">Ideas and tasks, ready for a day.</p>}
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
                    {inbox.filter((t) => showCompleted || !t.done).map((t) => (
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
                  {inbox.length === 0 && <p className="px-1 py-2 text-sm text-slate-500">Capture tasks here, then open a task to choose its date.</p>}
                  {!showCompleted && inbox.length > 0 && inboxOpen === 0 && <p className="px-1 py-2 text-sm text-slate-500">Inbox clear. Completed tasks are hidden.</p>}
                </DropColumn>
                <div className="mt-2"><QuickAdd date={null} placeholder="Capture a task…" compact /></div>
              </>
            )}
          </div>
          <section className="habit-glance"><div className="mb-5 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-bold"><Repeat2 size={16} className="text-accent" />Daily rhythm</h2><a href="/habits" className="text-xs font-semibold text-accent hover:underline">View habits</a></div><HabitPulse /></section>
          <p className="px-1 text-xs leading-relaxed text-slate-500">Open a task to choose its date. On a larger screen, you can also drag it into your week.</p>
          </aside>
        </div>
      </DndContext>}

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
