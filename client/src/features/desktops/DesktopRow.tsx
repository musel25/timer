import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type { Desktop } from '../../lib/types';
import { useDeleteDesktop, useSaveDesktop } from '../../lib/hooks';
import { taskProgress } from './cardOps';
import { TaskList } from './TaskList';

/**
 * One desktop, always open and always editable — there is no card-vs-stage
 * mode to be in. With a handful of workspaces the whole day reads top to
 * bottom, which is the only thing this tab is for.
 */
export function DesktopRow({ desktop, number }: { desktop: Desktop; number: number }) {
  const save = useSaveDesktop();
  const del = useDeleteDesktop();
  const [title, setTitle] = useState(desktop.title);
  const { done, total } = taskProgress(desktop.tasks);

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== desktop.title) save.mutate({ id: desktop.id, title: t });
    if (!t) setTitle(desktop.title); // never blank the title
  };

  return (
    <section className="card space-y-1 p-4">
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-center font-mono text-lg font-bold text-slate-600">
          {number}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 bg-transparent font-semibold text-slate-100 outline-none placeholder:text-slate-600"
          placeholder="What is this desktop?"
        />
        {total > 0 && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">{done}/{total}</span>
        )}
        <button
          onClick={() => { if (window.confirm(`Delete “${desktop.title}” and its tasks?`)) del.mutate(desktop.id); }}
          className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:text-slate-300"
          title="Delete this desktop"
        >
          <X size={15} />
        </button>
      </div>

      <div className="pl-9">
        <TaskList tasks={desktop.tasks} onChange={(tasks) => save.mutate({ id: desktop.id, tasks })} />
      </div>
    </section>
  );
}
