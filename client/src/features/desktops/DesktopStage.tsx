import { useState, type KeyboardEvent } from 'react';
import { Archive, ChevronUp, Trash2 } from 'lucide-react';
import type { Desktop } from '../../lib/types';
import { useDeleteDesktop, useSaveDesktop } from '../../lib/hooks';
import { categoryColor, solid, tint } from '../../lib/palette';
import { taskProgress } from './cardOps';
import { TaskList } from './TaskList';

/**
 * The pinned full-width editor for the focused desktop. Mount it with
 * key={desktop.id} so the local drafts reset when a different card is pinned.
 *
 * A desktop is an organiser, not a journal: tasks and their steps take the whole
 * width. Cards still carry the `comments` written before the log was dropped —
 * the column is left untouched so nothing already written is lost.
 */
export function DesktopStage({ desktop, number }: { desktop: Desktop; number: number }) {
  const save = useSaveDesktop();
  const del = useDeleteDesktop();
  const color = categoryColor(desktop.lane || desktop.id);

  const [title, setTitle] = useState(desktop.title);
  const [lane, setLane] = useState(desktop.lane ?? '');
  const [desc, setDesc] = useState(desktop.description ?? '');

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

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tasks</h3>
          {total > 0 && <span className="font-mono text-[11px] tabular-nums text-slate-500">{done}/{total}</span>}
        </div>
        <TaskList tasks={desktop.tasks} onChange={(tasks) => save.mutate({ id: desktop.id, tasks })} />
      </div>

      {/* footer actions */}
      <div className="flex gap-2 border-t border-ink-600/60 pt-3">
        <button
          onClick={() => save.mutate({ id: desktop.id, archivedAt: Date.now(), focused: false })}
          className="btn-outline flex items-center gap-1.5 text-sm"
          title="Archive — the card survives; later desktops renumber down"
        >
          <Archive size={15} /> Done
        </button>
        <button
          onClick={() => { if (window.confirm(`Delete “${desktop.title}” and its tasks?`)) del.mutate(desktop.id); }}
          className="btn-outline flex items-center gap-1.5 text-sm text-slate-400"
        >
          <Trash2 size={15} /> Delete
        </button>
      </div>
    </section>
  );
}
