import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import type { DesktopTask } from '../../lib/types';
import { addTask, removeTask, renameTask, toggleTask } from './cardOps';

/**
 * A desktop's checklist: one flat level, every line editable in place. A
 * desktop holds one day of work, so text you can no longer correct is the one
 * thing it must not have.
 *
 * Every op replaces the whole array and hands it to `onChange`, which PATCHes
 * the column; there is no partial update to merge.
 */

/** Click-to-edit text. Enter or blur commits, Escape restores, blank reverts. */
function EditableText({
  value, onCommit, className,
}: { value: string; onCommit: (text: string) => void; className: string }) {
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
        title="Click to edit"
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
  const [draft, setDraft] = useState('');

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    onChange(addTask(tasks, t));
    setDraft(''); // the input keeps focus, so several tasks go in one after another
  };

  return (
    <div className="space-y-0.5">
      {tasks.map((t) => (
        <div key={t.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-ink-700/40">
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => onChange(toggleTask(tasks, t.id))}
            className="h-4 w-4 shrink-0 accent-accent"
          />
          <EditableText
            value={t.text}
            onCommit={(text) => onChange(renameTask(tasks, t.id, text))}
            className={`text-sm ${t.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}
          />
          <button
            onClick={() => onChange(removeTask(tasks, t.id))}
            className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition-opacity hover:text-slate-300 focus:opacity-100 group-hover:opacity-100"
            title="Remove task"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2.5 px-1">
        <Plus size={14} className="shrink-0 text-slate-600" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-slate-600"
          placeholder="Add a task…"
        />
      </div>
    </div>
  );
}
