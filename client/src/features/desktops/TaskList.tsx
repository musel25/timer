import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CornerDownRight, Plus, X } from 'lucide-react';
import type { DesktopTask } from '../../lib/types';
import {
  addSubtask, addTask, removeSubtask, removeTask, renameSubtask, renameTask,
  subtaskProgress, subtasksOf, toggleSubtask, toggleTask,
} from './cardOps';

/**
 * A desktop card's task list: one level of subtasks, and every line editable in
 * place. A desktop is an organiser — what lives on this workspace and what is
 * left to do on it — so text you can no longer correct is the one thing it must
 * not have.
 *
 * Every op replaces the whole array and hands it to `onChange`, which PATCHes
 * the column; there is no partial update to merge.
 */

/** Click-to-edit text. Enter or blur commits, Escape restores, blank reverts. */
function EditableText({
  value, onCommit, className, title,
}: { value: string; onCommit: (text: string) => void; className: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        title={title}
        className={`min-w-0 flex-1 truncate text-left ${className}`}
      >
        {value}
      </button>
    );
  }
  return (
    <input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      className="min-w-0 flex-1 rounded bg-ink-700 px-1.5 py-0.5 text-inherit outline-none ring-1 ring-accent/50"
    />
  );
}

export function TaskList({
  tasks, onChange,
}: { tasks: DesktopTask[]; onChange: (next: DesktopTask[]) => void }) {
  const [newTask, setNewTask] = useState('');
  /** Which task has its "add a step" input open. */
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [newSub, setNewSub] = useState('');

  const submitTask = () => {
    const t = newTask.trim();
    if (!t) return;
    onChange(addTask(tasks, t));
    setNewTask('');
  };
  const submitSub = (taskId: string) => {
    const t = newSub.trim();
    if (!t) { setAddingUnder(null); return; }
    onChange(addSubtask(tasks, taskId, t));
    setNewSub('');
  };

  return (
    <div className="space-y-1">
      {tasks.map((t) => {
        const subs = subtasksOf(t);
        const sub = subtaskProgress(t);
        return (
          <div key={t.id}>
            <div className="group flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-ink-700/40">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => onChange(toggleTask(tasks, t.id))}
                className="h-4 w-4 shrink-0 accent-accent"
              />
              <EditableText
                value={t.text}
                onCommit={(text) => onChange(renameTask(tasks, t.id, text))}
                title="Click to edit"
                className={`text-sm ${t.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}
              />
              {sub.total > 0 && (
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
                  {sub.done}/{sub.total}
                </span>
              )}
              <button
                onClick={() => { setAddingUnder(t.id); setNewSub(''); }}
                className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100"
                title="Add a step under this task"
              >
                <CornerDownRight size={13} />
              </button>
              <button
                onClick={() => onChange(removeTask(tasks, t.id))}
                className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100"
                title="Remove task"
              >
                <X size={13} />
              </button>
            </div>

            {subs.map((s) => (
              <div key={s.id} className="group flex items-center gap-2.5 rounded-lg py-0.5 pl-7 pr-1 hover:bg-ink-700/40">
                <input
                  type="checkbox"
                  checked={s.done}
                  onChange={() => onChange(toggleSubtask(tasks, t.id, s.id))}
                  className="h-3.5 w-3.5 shrink-0 accent-accent"
                />
                <EditableText
                  value={s.text}
                  onCommit={(text) => onChange(renameSubtask(tasks, t.id, s.id, text))}
                  title="Click to edit"
                  className={`text-[13px] ${s.done ? 'text-slate-600 line-through' : 'text-slate-300'}`}
                />
                <button
                  onClick={() => onChange(removeSubtask(tasks, t.id, s.id))}
                  className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100"
                  title="Remove step"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {addingUnder === t.id && (
              <div className="flex items-center gap-2.5 py-0.5 pl-7 pr-1">
                <Plus size={13} className="shrink-0 text-slate-600" />
                <input
                  autoFocus
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onBlur={() => submitSub(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitSub(t.id);
                    if (e.key === 'Escape') { setNewSub(''); setAddingUnder(null); }
                  }}
                  className="min-w-0 flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-slate-600"
                  placeholder="Add a step…"
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2.5 px-1 pt-1">
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
  );
}
