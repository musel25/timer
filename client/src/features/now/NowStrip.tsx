import { Link } from 'react-router-dom';
import { inFlight } from './nextUp';
import { useNowOptional } from './NowContext';

/** A one-line answer to "what am I in the middle of", on every page. Renders
 *  nothing when the board is empty, so a single-tasking day costs no chrome. */
export function NowStrip() {
  const now = useNowOptional();
  if (!now) return null;

  const live = inFlight(now.threads);
  if (live.length === 0) return null;

  const waiting = live.filter((t) => t.state === 'waiting').length;

  return (
    <Link
      to="/now"
      className="mb-4 flex items-center gap-2 rounded-xl border border-ink-600/70 bg-ink-800/60 px-3 py-2 text-sm backdrop-blur hover:bg-ink-700/70"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      <span className="min-w-0 flex-1 truncate">
        {now.active ? now.active.title : <span className="text-slate-400">nothing active</span>}
      </span>
      {waiting > 0 && <span className="shrink-0 text-xs text-slate-400">{waiting} waiting</span>}
      {now.ready > 0 && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: 'rgb(217 144 30)' }}>
          {now.ready} ready
        </span>
      )}
    </Link>
  );
}
