import { Check, Play, X } from 'lucide-react';
import type { Thread } from '../../lib/types';
import { useDeleteThread, useSaveThread } from '../../lib/hooks';
import { isReady } from './nextUp';

/** Coarse countdown — minutes, then hours. Precision here would only invite staring. */
function until(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

export function ThreadRow({ thread, now }: { thread: Thread; now: number }) {
  const save = useSaveThread();
  const del = useDeleteThread();
  const ready = isReady(thread, now);

  return (
    <div className="card flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{thread.title}</span>
          {thread.lane && <span className="shrink-0 text-xs text-accent">{thread.lane}</span>}
        </div>
        <div className="truncate text-xs text-slate-400">
          {ready ? (
            <span className="font-semibold text-accent">ready</span>
          ) : thread.state === 'waiting' && thread.wakeAt != null ? (
            <>waiting {thread.waitingOn ? `on ${thread.waitingOn} ` : ''}· {until(thread.wakeAt - now)}</>
          ) : thread.state === 'waiting' ? (
            <>waiting{thread.waitingOn ? ` on ${thread.waitingOn}` : ''} · no timer</>
          ) : (
            thread.nextStep || 'parked'
          )}
        </div>
      </div>

      <button
        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-slate-100"
        title="Pick this up"
        onClick={() => save.mutate({ id: thread.id, state: 'active', wakeAt: null })}
      >
        <Play size={16} />
      </button>
      <button
        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-slate-100"
        title="Done"
        onClick={() => save.mutate({ id: thread.id, doneAt: Date.now(), wakeAt: null })}
      >
        <Check size={16} />
      </button>
      <button
        className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-ink-700 hover:text-slate-100"
        title="Drop"
        onClick={() => del.mutate(thread.id)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
