import { inFlight } from './nextUp';
import { useNowOptional } from './NowContext';
import { AddThread } from './AddThread';
import { ThreadCard } from './ThreadCard';
import { ThreadRow } from './ThreadRow';

export function NowBoard() {
  const now = useNowOptional();
  if (!now) return null;

  const live = inFlight(now.threads);
  const headline = now.active ?? now.suggestion?.thread ?? null;
  const rest = live.filter((t) => t.id !== headline?.id);
  const waiting = rest.filter((t) => t.state === 'waiting');
  const parked = rest.filter((t) => t.state !== 'waiting');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Now</h1>
        <p className="text-sm text-slate-400">
          {live.length} of {now.limit} in flight{now.ready > 0 ? ` · ${now.ready} ready` : ''}
        </p>
      </header>

      {headline ? (
        <ThreadCard
          thread={headline}
          suggestion={now.active ? undefined : now.suggestion?.reason}
        />
      ) : (
        <section className="card p-5 text-sm text-slate-400">
          Nothing in flight. Add the thing you're starting.
        </section>
      )}

      {/* A ready thread outranks whatever you are on — that is the whole point. */}
      {now.active && now.suggestion?.reason === 'ready' && (
        <ThreadCard thread={now.suggestion.thread} suggestion="ready" />
      )}

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting</h2>
          {waiting.map((t) => <ThreadRow key={t.id} thread={t} now={now.now} />)}
        </section>
      )}

      {parked.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Parked</h2>
          {parked.map((t) => <ThreadRow key={t.id} thread={t} now={now.now} />)}
        </section>
      )}

      <AddThread full={now.full} limit={now.limit} />
    </div>
  );
}
