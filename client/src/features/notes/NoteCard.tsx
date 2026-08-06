import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, Pin, Trash2, X } from 'lucide-react';
import type { Note } from '../../lib/types';
import { useDeleteNote, useSaveNote } from '../../lib/hooks';
import { extractTags, isArchived, splitByTags } from './noteTags';

const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function NoteCard({ note, onTagClick }: { note: Note; onTagClick: (tag: string) => void }) {
  const save = useSaveNote();
  const del = useDeleteNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = isArchived(note);

  function saveEdit() {
    const t = draft.trim();
    if (!t) return;
    if (t !== note.text) save.mutate({ id: note.id, text: t, tags: extractTags(t) });
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(note.text);
    setEditing(false);
  }

  if (editing) {
    return (
      <article className="card space-y-2 px-4 py-3">
        <textarea
          className="input min-h-[4.5rem] resize-y text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
            if (e.key === 'Escape') cancelEdit();
          }}
          autoFocus
        />
        <div className="flex gap-2">
          <button className="btn-accent px-3 py-1.5 text-sm" onClick={saveEdit}><Check size={14} /> Save</button>
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={cancelEdit}><X size={14} /> Cancel</button>
        </div>
      </article>
    );
  }

  return (
    <article className={`card px-4 py-3 ${archived ? 'opacity-70' : ''}`}>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
        {splitByTags(note.text).map((p, i) =>
          p.isTag ? (
            <button
              key={i}
              className="font-medium text-accent hover:underline"
              onClick={() => onTagClick(p.text.slice(1).toLowerCase())}
            >
              {p.text}
            </button>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
      <div className="mt-2 flex items-center gap-2 text-slate-500">
        <span className="text-[11px]">{timeLabel(note.createdAt)}</span>
        {note.pinned && <Pin size={11} className="text-accent" />}
        <span className="ml-auto flex items-center gap-1">
          {!archived && (
            <button
              className={`rounded-lg p-1.5 transition hover:bg-ink-700 ${note.pinned ? 'text-accent' : 'hover:text-slate-200'}`}
              title={note.pinned ? 'Unpin' : 'Pin to top'}
              onClick={() => save.mutate({ id: note.id, pinned: !note.pinned })}
            >
              <Pin size={14} />
            </button>
          )}
          <button
            className="rounded-lg p-1.5 transition hover:bg-ink-700 hover:text-slate-200"
            title="Edit"
            onClick={() => { setDraft(note.text); setEditing(true); }}
          >
            <Pencil size={14} />
          </button>
          {/* Reversible, so no confirm — archiving also drops the pin. */}
          <button
            className="rounded-lg p-1.5 transition hover:bg-ink-700 hover:text-slate-200"
            title={archived ? 'Move back to inbox' : 'Archive (hide, keep)'}
            onClick={() =>
              save.mutate(
                archived
                  ? { id: note.id, archivedAt: null }
                  : { id: note.id, archivedAt: Date.now(), pinned: false },
              )
            }
          >
            {archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </button>
          {confirmDelete ? (
            <button
              className="rounded-lg px-2 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
              onClick={() => del.mutate(note.id)}
              onBlur={() => setConfirmDelete(false)}
              autoFocus
            >
              Sure?
            </button>
          ) : (
            <button
              className="rounded-lg p-1.5 transition hover:bg-ink-700 hover:text-red-400"
              title="Delete"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </span>
      </div>
    </article>
  );
}
