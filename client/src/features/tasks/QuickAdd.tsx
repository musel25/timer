import { useState } from 'react';
import { useSaveTask } from '../../lib/hooks';

/** Title input that creates a task with the given date (null = Inbox). */
export function QuickAdd({ date, placeholder = 'Add a task…' }: { date: string | null; placeholder?: string }) {
  const [title, setTitle] = useState('');
  const save = useSaveTask();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    save.mutate({ title: t, date });
    setTitle('');
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-dashed border-ink-600 px-3 py-2">
      <span className="text-slate-400">＋</span>
      <input
        className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
    </form>
  );
}
