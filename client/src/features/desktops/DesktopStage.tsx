import { useState, type KeyboardEvent } from 'react';
import { Archive, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import type { Desktop } from '../../lib/types';
import { useDeleteDesktop, useSaveDesktop } from '../../lib/hooks';
import { categoryColor, solid, tint } from '../../lib/palette';
import { addComment, addTask, removeTask, taskProgress, toggleTask } from './cardOps';

/** Comment timestamp: time of day today, short date otherwise. */
function fmtAt(at: number): string {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * The pinned full-width editor for the focused desktop. Mount it with
 * key={desktop.id} so the local drafts reset when a different card is pinned.
 */
export function DesktopStage({ desktop, number }: { desktop: Desktop; number: number }) {
  const save = useSaveDesktop();
  const del = useDeleteDesktop();
  const color = categoryColor(desktop.lane || desktop.id);

  const [title, setTitle] = useState(desktop.title);
  const [lane, setLane] = useState(desktop.lane ?? '');
  const [desc, setDesc] = useState(desktop.description ?? '');
  const [newTask, setNewTask] = useState('');
  const [newNote, setNewNote] = useState('');

  const { done, total } = taskProgress(desktop.tasks);

  const saveMeta = () => {
    const t = title.trim();
    save.mutate({
      id: desktop.id,
      title: t || desktop.title, // never blank the title
      lane: lane.trim() || null,
      description: desc.trim() || null,
    });
    if (!t) setTitle(desktop.title);
  };
  const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };

  const submitTask = () => {
    const t = newTask.trim();
    if (!t) return;
    save.mutate({ id: desktop.id, tasks: addTask(desktop.tasks, t) });
    setNewTask('');
  };
  const submitNote = () => {
    const t = newNote.trim();
    if (!t) return;
    save.mutate({ id: desktop.id, comments: addComment(desktop.comments, t, Date.now()) });
    setNewNote('');
  };

  return (
    <section
      className="card space-y-4 p-5 shadow-xl"
      style={{ boxShadow: `0 0 0 1.5px ${solid(color.rgb)}, 0 16px 40px rgb(0 0 0 / 0.35)` }}
    >
      {/* header row */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-mono text-xl font-bold"
          style={{ background: tint(color.rgb, 0.16), color: solid(color.rgb) }}
        >
          {number}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveMeta}
          onKeyDown={blurOnEnter}
          className="min-w-0 flex-1 bg-transparent text-xl font-bold text-slate-100 outline-none placeholder:text-slate-600"
          placeholder="What is this desktop?"
        />
        <input
          value={lane}
          onChange={(e) => setLane(e.target.value)}
          onBlur={saveMeta}
          onKeyDown={blurOnEnter}
          className="w-24 rounded-full px-2.5 py-1 text-center text-xs font-medium outline-none placeholder:text-slate-600"
          style={{ background: tint(color.rgb, 0.14), color: solid(color.rgb) }}
          placeholder="lane"
        />
        <button
          onClick={() => save.mutate({ id: desktop.id, focused: false })}
          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-slate-100"
          title="Collapse (Esc)"
        >
          <ChevronUp size={18} />
        </button>
      </div>

      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={saveMeta}
        rows={desc.length > 120 ? 3 : 2}
        className="w-full resize-none rounded-xl bg-ink-700/50 px-3 py-2 text-sm text-slate-300 outline-none placeholder:text-slate-600"
        placeholder="Describe what lives on this desktop…"
      />

      {/* tasks + log */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tasks</h3>
            {total > 0 && <span className="font-mono text-[11px] tabular-nums text-slate-500">{done}/{total}</span>}
          </div>
          {desktop.tasks.map((t) => (
            <div key={t.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-ink-700/40">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => save.mutate({ id: desktop.id, tasks: toggleTask(desktop.tasks, t.id) })}
                className="h-4 w-4 accent-accent"
              />
              <span className={`flex-1 text-sm ${t.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                {t.text}
              </span>
              <button
                onClick={() => save.mutate({ id: desktop.id, tasks: removeTask(desktop.tasks, t.id) })}
                className="rounded p-1 text-slate-600 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100"
                title="Remove task"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Plus size={14} className="shrink-0 text-slate-600" />
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitTask(); }}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-slate-600"
              placeholder="Add a task…"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Log</h3>
          <div className="flex items-center gap-2">
            <Plus size={14} className="shrink-0 text-slate-600" />
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-slate-600"
              placeholder="Note what just happened…"
            />
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {desktop.comments.map((cm) => (
              <div key={cm.id} className="border-l-2 pl-2.5" style={{ borderColor: tint(color.rgb, 0.5) }}>
                <div className="font-mono text-[10px] tabular-nums text-slate-500">{fmtAt(cm.at)}</div>
                <div className="text-sm text-slate-300">{cm.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* footer actions */}
      <div className="flex gap-2 border-t border-ink-600/60 pt-3">
        <button
          onClick={() => save.mutate({ id: desktop.id, archivedAt: Date.now(), focused: false })}
          className="btn-outline flex items-center gap-1.5 text-sm"
          title="Archive — the journal survives; later desktops renumber down"
        >
          <Archive size={15} /> Done
        </button>
        <button
          onClick={() => { if (window.confirm(`Delete “${desktop.title}” and its journal?`)) del.mutate(desktop.id); }}
          className="btn-outline flex items-center gap-1.5 text-sm text-slate-400"
        >
          <Trash2 size={15} /> Delete
        </button>
      </div>
    </section>
  );
}
