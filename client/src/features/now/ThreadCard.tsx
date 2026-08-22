import { useState } from 'react';
import { Check, Hourglass, Pause, Play } from 'lucide-react';
import type { Thread } from '../../lib/types';
import { useSaveThread } from '../../lib/hooks';
import { ensureNotifyPermission } from './notify';

const WAIT_CHIPS = [5, 15, 30, 60];

/** The one thread you are on (or the one being suggested). Large on purpose: it
 *  is the answer to "what am I doing right now". */
export function ThreadCard({ thread, suggestion }: { thread: Thread; suggestion?: 'ready' | 'stalest' }) {
  const save = useSaveThread();
  const [parking, setParking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [note, setNote] = useState(thread.nextStep ?? '');
  const isActive = thread.state === 'active';

  function park() {
    save.mutate({ id: thread.id, state: 'parked', nextStep: note.trim() || null, wakeAt: null });
    setParking(false);
  }

  function waitFor(minutes: number | null) {
    save.mutate({
      id: thread.id, state: 'waiting',
      wakeAt: minutes == null ? null : Date.now() + minutes * 60_000,
      nextStep: note.trim() || thread.nextStep || null,
    });
    setWaiting(false);
    // Ask for permission *after* saving, and never await it: an ignored prompt
    // (it just sits there until dismissed) must not cost you the wake-up you
    // just set. Worst case you lose the notification, not the thread state.
    if (minutes != null) void ensureNotifyPermission();
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {isActive ? "You're on" : suggestion === 'ready' ? 'Ready for you' : 'Next up'}
      </div>

      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 text-2xl font-bold leading-tight">{thread.title}</h2>
        {thread.lane && (
          <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            {thread.lane}
          </span>
        )}
      </div>

      {thread.nextStep && !parking && (
        <p className="text-sm text-slate-400">
          <span className="text-slate-500">Where you were: </span>{thread.nextStep}
        </p>
      )}

      {parking ? (
        <div className="space-y-2">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') park(); if (e.key === 'Escape') setParking(false); }}
            placeholder="Where were you? (one line)"
            className="w-full rounded-xl bg-ink-700 px-3 py-2 text-sm outline-none placeholder:text-slate-500"
          />
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={park}>Park it</button>
            <button className="btn-outline flex-1" onClick={() => setParking(false)}>Cancel</button>
          </div>
        </div>
      ) : waiting ? (
        <div className="space-y-2">
          <div className="text-sm text-slate-400">Poke me in…</div>
          <div className="flex flex-wrap gap-2">
            {WAIT_CHIPS.map((m) => (
              <button key={m} className="btn-outline px-3 py-1.5 text-sm" onClick={() => waitFor(m)}>{m}m</button>
            ))}
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => waitFor(null)}>No timer</button>
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setWaiting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {isActive ? (
            <>
              <button className="btn-outline flex items-center gap-1.5" onClick={() => setParking(true)}>
                <Pause size={16} /> Park
              </button>
              <button className="btn-outline flex items-center gap-1.5" onClick={() => setWaiting(true)}>
                <Hourglass size={16} /> Waiting on…
              </button>
            </>
          ) : (
            <button
              className="btn-outline flex items-center gap-1.5"
              onClick={() => save.mutate({ id: thread.id, state: 'active', wakeAt: null })}
            >
              <Play size={16} /> Pick this up
            </button>
          )}
          <button
            className="btn-outline flex items-center gap-1.5"
            onClick={() => save.mutate({ id: thread.id, doneAt: Date.now(), state: 'parked', wakeAt: null })}
          >
            <Check size={16} /> Done
          </button>
        </div>
      )}
    </section>
  );
}
