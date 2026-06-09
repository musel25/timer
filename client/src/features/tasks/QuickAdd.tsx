import { useState } from 'react';
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
    save.mutate({ title: t, date });
    setTitle('');
  }

  return (
    <form
      onSubmit={submit}
      className={`flex items-center rounded-lg border border-dashed border-ink-600 transition focus-within:border-accent/70 ${
        compact ? 'gap-1 px-1.5 py-1' : 'gap-2 px-3 py-2'
      }`}
    >
      <span className={`shrink-0 text-slate-400 ${compact ? 'text-xs leading-none' : ''}`}>＋</span>
      <input
        className={`w-full min-w-0 bg-transparent outline-none placeholder:text-slate-500 ${compact ? 'text-[11px]' : 'text-sm'}`}
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
    </form>
  );
}
