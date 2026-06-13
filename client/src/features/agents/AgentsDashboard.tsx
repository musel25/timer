import { useEffect, useState } from 'react';
import { Bot, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { categoryColor, solid } from '../../lib/palette';
import { useAgents } from './AgentsContext';
import { countByState, groupByProject } from './sessionView';
import { enableNotifications } from './alerts';
import { AgentSessionCard } from './AgentSessionCard';

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function AgentsDashboard() {
  const { cards, connected, muted, setMuted } = useAgents();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const now = useNow(5000);

  const visible = cards.filter((c) => !dismissed.has(c.sessionId));
  const groups = groupByProject(visible);
  const counts = countByState(visible);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (!next) enableNotifications(); // un-muting is a click → safe to request permission
  }
  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
  }

  return (
    <div className="space-y-6">
      <header className="hero">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">Agents</h1>
            <p className="mt-1 text-sm text-slate-300">Your live Claude Code sessions across every project</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`stat-pill ${connected ? 'text-green-400' : 'text-amber-400'}`} title={connected ? 'Live' : 'Reconnecting…'}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {connected ? 'Live' : 'Reconnecting'}
            </span>
            <button onClick={toggleMute} className="stat-pill text-slate-200 hover:text-white" title={muted ? 'Alerts muted — click to enable' : 'Mute alerts'}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {muted ? 'Muted' : 'Alerts on'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="stat-pill" style={{ color: solid('217 144 30') }}>⚠ {counts.waiting} waiting</span>
          <span className="stat-pill" style={{ color: solid('58 109 240') }}>▶ {counts.running} running</span>
          <span className="stat-pill text-slate-300">✓ {counts.finished} done</span>
          {counts.stale > 0 && <span className="stat-pill" style={{ color: solid('225 45 85') }}>✕ {counts.stale} lost</span>}
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-400">
          <Bot size={32} className="text-slate-500" />
          <p className="text-sm">No Claude Code sessions detected.</p>
          <p className="text-xs text-slate-500">Start a session in any project — it’ll appear here automatically.</p>
        </div>
      ) : (
        groups.map((g) => {
          const rgb = categoryColor(g.project).rgb;
          return (
            <section key={g.project} className="space-y-2">
              <div className="flex items-baseline gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: solid(rgb) }} />
                <h2 className="text-sm font-semibold text-slate-200">{g.project}</h2>
                <span className="truncate font-mono text-[11px] text-slate-500" title={g.cards[0]?.cwd}>{g.cards[0]?.cwd}</span>
                <span className="ml-auto text-xs text-slate-500">{g.cards.length} session{g.cards.length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2">
                {g.cards.map((c) => (
                  <AgentSessionCard key={c.sessionId} card={c} now={now} onDismiss={dismiss} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
