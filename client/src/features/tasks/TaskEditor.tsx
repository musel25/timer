import { useState } from 'react';
import type { Task } from '../../lib/types';
import { useSaveTask, useDeleteTask } from '../../lib/hooks';

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState(task.date ?? '');
  const save = useSaveTask();
  const del = useDeleteTask();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await save.mutateAsync({ id: task.id, title: title.trim(), notes: notes.trim() || null, date: date || null });
      onClose();
    } catch {
      // keep modal open on error
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card w-full max-w-md space-y-3 rounded-b-none rounded-t-2xl p-4 sm:rounded-2xl"
      >
        <input className="input text-base font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
        <textarea className="input min-h-[72px] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        <label className="label">Date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-center justify-between pt-1">
          <button type="button" className="btn-outline text-rose-500" onClick={async () => { if (!confirm('Delete this task?')) return; try { await del.mutateAsync(task.id); onClose(); } catch { /* keep open */ } }}>Delete</button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent">Save</button>
          </div>
        </div>
      </form>
    </div>
  );
}
