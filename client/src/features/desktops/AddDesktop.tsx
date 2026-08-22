import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useSaveDesktop } from '../../lib/hooks';
import { extractTags } from '../notes/noteTags';

/** The always-last dashed card: type a title (with optional #lane), Enter to
 *  create desktop N+1 — same capture idiom as Notes. */
export function AddDesktop({ nextNumber }: { nextNumber: number }) {
  const [text, setText] = useState('');
  const save = useSaveDesktop();

  function submit(e: FormEvent) {
    e.preventDefault();
    const raw = text.trim();
    if (!raw) return;
    const lane = extractTags(raw)[0] ?? null;
    const title = raw.replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    save.mutate({ title, lane });
    setText('');
  }

  return (
    <form
      onSubmit={submit}
      className="flex min-h-[7rem] flex-col justify-center gap-2 rounded-2xl border border-dashed border-ink-500/80 p-4 transition-colors focus-within:border-accent/60 hover:border-ink-400"
    >
      <div className="flex items-center gap-2 text-slate-500">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-ink-500 font-mono text-lg font-bold">
          {nextNumber}
        </span>
        <Plus size={16} />
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`New desktop… (#lane optional)`}
        className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
      />
    </form>
  );
}
