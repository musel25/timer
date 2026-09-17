import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSaveTask } from '../../lib/hooks';

/** Title input that creates a task with the given date (null = Inbox).
 *  `compact` is used in tight spaces like the week board's day columns. */
export function QuickAdd({
  date,
  placeholder = 'Add a task…',
  compact = false,
}: {
  date: string | null;
  placeholder?: string;
  compact?: boolean;
}) {
  const [title, setTitle] = useState('');
  const save = useSaveTask();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || save.isPending) return;
    save.mutate({ title: t, date }, { onSuccess: () => setTitle((current) => current.trim() === t ? '' : current) });
  }

  return (
    <form
      onSubmit={submit}
      className={`quick-add flex items-center rounded-lg border border-dashed border-ink-600 transition focus-within:border-accent/70 ${
        compact ? 'gap-1.5 px-2 py-1.5' : 'gap-2 px-3 py-2'
      }`}
    >

      <input
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-500"
        aria-label={date ? `Add task for ${date}` : 'Add task to Inbox'}
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit" aria-label={date ? `Create task for ${date}` : 'Create inbox task'} disabled={!title.trim() || save.isPending} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-ink-700 hover:text-accent disabled:opacity-30"><Plus size={16} /></button>
      {save.isError && <span role="alert" className="text-xs text-rose-400">Could not save</span>}
    </form>
  );
}
