import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Task } from '../../lib/types';
import { useSaveTask, useDeleteTask, useTaskAttachments, useUploadAttachment, useDeleteAttachment } from '../../lib/hooks';
import { resizeImageToDataUrl } from '../../lib/imageResize';

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState(task.date ?? '');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const save = useSaveTask();
  const del = useDeleteTask();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const fields = formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], select:not(:disabled)');
      if (!fields?.length) return;
      const first = fields[0];
      const last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const { data: attachments } = useTaskAttachments(task.id);
  const upload = useUploadAttachment();
  const removeAttachment = useDeleteAttachment();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || save.isPending) return;
    setActionError(null);
    try {
      await save.mutateAsync({ id: task.id, title: title.trim(), notes: notes.trim() || null, date: date || null });
      onClose();
    } catch {
      setActionError('Could not save your task. Your changes are still here; please try again.');
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
    <div data-modal className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-heading"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-b-none rounded-t-xl p-5 sm:rounded-xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="task-editor-heading" className="text-lg font-semibold">Edit task</h2>
          <button type="button" onClick={onClose} aria-label="Close task editor" className="rounded-md p-2 text-slate-400 hover:bg-ink-700"><X size={18} /></button>
        </div>
        <label className="block space-y-1.5">
          <span className="label">Task</span>
          <input ref={titleRef} className="input text-base font-medium" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" required />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Notes</span>
        <textarea
          className="input min-h-[100px] resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onPaste={onPaste}
          placeholder="Notes (optional) — paste an image to attach it"
        />
        </label>

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

        <label className="block space-y-1.5">
          <span className="label">Scheduled date</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {date ? <button type="button" className="text-sm text-accent hover:underline" onClick={() => setDate('')}>Move to inbox instead</button> : <p className="text-sm text-slate-400">In your inbox, ready to schedule.</p>}
        {actionError && <p role="alert" className="text-sm text-rose-400">{actionError}</p>}
        <div className="flex items-center justify-between pt-1">
          <button type="button" disabled={del.isPending || save.isPending} className="btn-outline text-rose-500" onClick={async () => { if (!confirm('Delete this task?')) return; try { await del.mutateAsync(task.id); onClose(); } catch { setActionError('Could not delete this task. Please try again.'); } }}>Delete</button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-accent" disabled={save.isPending || del.isPending || !title.trim()}>{save.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
