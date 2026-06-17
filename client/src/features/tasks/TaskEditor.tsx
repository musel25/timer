import { useState } from 'react';
import { X } from 'lucide-react';
import type { Task } from '../../lib/types';
import { useSaveTask, useDeleteTask, useTaskAttachments, useUploadAttachment, useDeleteAttachment } from '../../lib/hooks';
import { resizeImageToDataUrl } from '../../lib/imageResize';

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState(task.date ?? '');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const save = useSaveTask();
  const del = useDeleteTask();

  const { data: attachments } = useTaskAttachments(task.id);
  const upload = useUploadAttachment();
  const removeAttachment = useDeleteAttachment();

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

  async function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((it) => it.type.startsWith('image/'));
    if (!imageItem) return; // let normal text paste proceed
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setPasteError(null);
    try {
      const { dataUrl, width, height } = await resizeImageToDataUrl(file);
      await upload.mutateAsync({ taskId: task.id, dataUrl, width, height });
    } catch {
      setPasteError('Could not attach that image.');
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
        <textarea
          className="input min-h-[72px] resize-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onPaste={onPaste}
          placeholder="Notes (optional) — paste an image to attach it"
        />

        {upload.isPending && <p className="text-xs text-slate-400">Attaching image…</p>}
        {pasteError && <p className="text-xs text-rose-400">{pasteError}</p>}

        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="group relative">
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/attachments/${a.id}`}
                    alt="attachment"
                    className="h-20 w-20 rounded-lg object-cover ring-1 ring-ink-600"
                  />
                </a>
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => removeAttachment.mutate({ id: a.id, taskId: task.id })}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-800 p-0.5 text-slate-200 ring-1 ring-ink-600 transition hover:text-rose-400"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

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
