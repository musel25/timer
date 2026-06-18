import { EyeOff, Check, Paperclip } from 'lucide-react';
import type { Task } from '../../lib/types';
import { useToggleTask } from '../../lib/hooks';

export function TaskRow({ task, onEdit, onHide }: { task: Task; onEdit?: (t: Task) => void; onHide?: (t: Task) => void }) {
  const toggle = useToggleTask();
  return (
    <div className="group flex items-start gap-3 py-2">
      <button
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
        onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
        className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded-md border-[1.6px] transition ${
          task.done ? 'border-transparent bg-accent' : 'border-ink-500 hover:border-accent'
        }`}
      >
        {task.done && <Check size={14} strokeWidth={3} className="mx-auto text-white" />}
      </button>
      <button
        onClick={() => onEdit?.(task)}
        className={`min-w-0 flex-1 break-words text-left text-sm ${task.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
      >
        {task.title}
      </button>
      {!!task.attachmentCount && (
        <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-slate-500" title={`${task.attachmentCount} image${task.attachmentCount > 1 ? 's' : ''}`}>
          <Paperclip size={13} />
          {task.attachmentCount}
        </span>
      )}
      {onHide && (
        <button
          aria-label="Hide from today"
          title="Hide from today"
          onClick={() => onHide(task)}
          className="shrink-0 text-slate-500 opacity-0 transition hover:text-slate-200 group-hover:opacity-100"
        >
          <EyeOff size={16} />
        </button>
      )}
    </div>
  );
}
