import { useState, type FormEvent } from 'react';
import { useSaveDesktop } from '../../lib/hooks';

/** The always-last row: type a name, Enter to create desktop N+1. */
export function AddDesktop({ nextNumber }: { nextNumber: number }) {
  const [title, setTitle] = useState('');
  const save = useSaveDesktop();

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    save.mutate({ title: t });
    setTitle('');
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-3 px-4 py-3">
      <span className="w-6 shrink-0 text-center font-mono text-lg font-bold text-slate-700">
        {nextNumber}
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New desktop…"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-600"
      />
    </form>
  );
}
