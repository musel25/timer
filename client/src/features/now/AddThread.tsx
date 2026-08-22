import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useSaveThread } from '../../lib/hooks';
import { extractTags } from '../notes/noteTags';

/** One field, Enter to commit. A trailing/inline #lane sets the project lane and
 *  is stripped from the title, matching how Notes handles #tags. */
export function AddThread({ full, limit }: { full: boolean; limit: number }) {
  const [text, setText] = useState('');
  const save = useSaveThread();

  function submit(e: FormEvent) {
    e.preventDefault();
    const raw = text.trim();
    if (!raw || full) return;
    const lane = extractTags(raw)[0] ?? null;
    const title = raw.replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    save.mutate({ title, lane });
    setText('');
  }

  if (full) {
    return (
      <div className="card p-4 text-sm text-slate-400">
        Board is full — {limit} threads in flight. Finish or drop one before starting another.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card flex items-center gap-2 p-2">
      <Plus size={18} className="ml-1 shrink-0 text-slate-500" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What are you picking up? (#lane optional)"
        className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-500"
      />
    </form>
  );
}
