import type { Task } from '../../lib/types';
import { useToggleTask } from '../../lib/hooks';

export function TaskRow({ task, onEdit }: { task: Task; onEdit?: (t: Task) => void }) {
  const toggle = useToggleTask();
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
        onClick={() => toggle.mutate({ id: task.id, done: !task.done })}
        className={`h-[18px] w-[18px] shrink-0 rounded-md border-[1.6px] transition ${
          task.done ? 'border-transparent bg-accent' : 'border-ink-500 hover:border-accent'
        }`}
      >
        {task.done && <span className="block text-center text-[11px] leading-[16px] text-white">✓</span>}
      </button>
      <button
        onClick={() => onEdit?.(task)}
        className={`min-w-0 flex-1 truncate text-left text-sm ${task.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
      >
        {task.title}
      </button>
    </div>
  );
}
