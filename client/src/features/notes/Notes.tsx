import { useMemo, useState } from 'react';
import { Archive, Pin, Search, Send } from 'lucide-react';
import { useNotes, useSaveNote } from '../../lib/hooks';
import { addDaysKey, dateToKey, todayKey } from '../../lib/date';
import type { Note } from '../../lib/types';
import { NoteCard } from './NoteCard';
import { extractTags, isArchived } from './noteTags';

function dayLabel(ts: number): string {
  const key = dateToKey(new Date(ts));
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === addDaysKey(today, -1)) return 'Yesterday';
  const d = new Date(ts);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function Notes() {
  const { data: notes = [], isLoading } = useNotes();
  const save = useSaveNote();
  const [draft, setDraft] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'inbox' | 'archive'>('inbox');

  const archivedCount = notes.filter(isArchived).length;
  // Falls back to the inbox on its own once the archive empties out.
  const inArchive = view === 'archive' && archivedCount > 0;
  const scoped = notes.filter((n) => isArchived(n) === inArchive);

  function submit() {
    const t = draft.trim();
    if (!t || save.isPending) return;
    save.mutate({ text: t, tags: extractTags(t) });
    setDraft('');
  }

  // Tags, counts and search all scope to the view you're in — an archived note
  // contributes nothing to the inbox, which is the point of archiving it.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      if (isArchived(n) !== inArchive) continue;
      for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes, inArchive]);

  const q = query.trim().toLowerCase();
  const filtered = scoped.filter(
    (n) => (!tagFilter || n.tags.includes(tagFilter)) && (!q || n.text.toLowerCase().includes(q)),
  );
  const pinned = filtered.filter((n) => n.pinned);

  // Server returns newest first; walk the unpinned rest into consecutive day groups.
  const dayGroups: { label: string; notes: Note[] }[] = [];
  for (const n of filtered.filter((n) => !n.pinned)) {
    const label = dayLabel(n.createdAt);
    const last = dayGroups[dayGroups.length - 1];
    if (last?.label === label) last.notes.push(n);
    else dayGroups.push({ label, notes: [n] });
  }

  const filtering = tagFilter !== null || q !== '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">{inArchive ? 'Archive' : 'Notes'}</h1>
        <div className="mt-1 text-sm text-slate-300">
          {inArchive
            ? `${scoped.length} note${scoped.length === 1 ? '' : 's'} kept out of the way`
            : scoped.length > 0
              ? `${scoped.length} note${scoped.length === 1 ? '' : 's'}${tagCounts.length > 0 ? ` · ${tagCounts.length} tag${tagCounts.length === 1 ? '' : 's'}` : ''}`
              : 'Capture ideas before they slip away'}
        </div>
      </header>

      {/* The archive is read-and-restore only — a new note always lands in the inbox. */}
      {!inArchive && (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-end gap-2 rounded-[20px] border border-dashed border-ink-600 px-4 py-3 transition focus-within:border-accent/70"
        >
          <textarea
            className="max-h-48 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-slate-500"
            placeholder="What's on your mind? Use #tags to organize — e.g. drink water after coffee #habits"
            rows={draft.includes('\n') ? 3 : 1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
          />
          <button
            type="submit"
            className="btn-accent shrink-0 px-3 py-2"
            disabled={!draft.trim() || save.isPending}
            title="Save note (Enter)"
          >
            <Send size={15} />
          </button>
        </form>
      )}

      {(tagCounts.length > 0 || archivedCount > 0 || notes.length > 3) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tagCounts.length > 0 && (
            <>
              <button
                className={`chip min-w-0 px-2.5 py-1 text-xs ${tagFilter === null ? 'chip-active' : ''}`}
                onClick={() => setTagFilter(null)}
              >
                All
              </button>
              {tagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  className={`chip min-w-0 px-2.5 py-1 text-xs ${tagFilter === tag ? 'chip-active' : ''}`}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                >
                  #{tag} <span className="ml-1 opacity-60">{count}</span>
                </button>
              ))}
            </>
          )}
          {/* Archive toggle + search travel together on the right edge. */}
          <div className="ml-auto flex items-center gap-1.5">
            {archivedCount > 0 && (
              <button
                className={`chip min-w-0 gap-1 px-2.5 py-1 text-xs ${inArchive ? 'chip-active' : ''}`}
                title={inArchive ? 'Back to the inbox' : 'Show archived notes'}
                // Tags differ between the two lists, so a carried-over filter would
                // match nothing; the search term is worth keeping.
                onClick={() => { setView(inArchive ? 'inbox' : 'archive'); setTagFilter(null); }}
              >
                <Archive size={12} /> Archived <span className="opacity-60">{archivedCount}</span>
              </button>
            )}
            <label className="flex min-w-[8rem] items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 transition focus-within:border-accent/70">
              <Search size={13} className="shrink-0 text-slate-500" />
              <input
                className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-slate-500"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      {pinned.length > 0 && (
        <section>
          <h2 className="label mb-2 flex items-center gap-1.5"><Pin size={12} /> Pinned</h2>
          <div className="space-y-2">
            {pinned.map((n) => <NoteCard key={n.id} note={n} onTagClick={setTagFilter} />)}
          </div>
        </section>
      )}

      {dayGroups.map((g) => (
        <section key={g.label}>
          <h2 className="label mb-2">{g.label}</h2>
          <div className="space-y-2">
            {g.notes.map((n) => <NoteCard key={n.id} note={n} onTagClick={setTagFilter} />)}
          </div>
        </section>
      ))}

      {!isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-slate-500">
          {filtering
            ? 'No notes match this filter.'
            : inArchive
              ? 'Nothing archived.'
              : 'No notes yet — jot down your first thought above.'}
        </p>
      )}
    </div>
  );
}
