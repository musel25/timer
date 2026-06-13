import { BellRing, Bot, CircleCheck, CircleDot, CircleHelp, LoaderCircle, Monitor, Terminal, X, type LucideIcon } from 'lucide-react';
import { humanDuration } from '../../lib/time';
import { tint, solid } from '../../lib/palette';
import type { SessionCard } from './types';

type ViewKey = 'asking' | 'idle' | 'running' | 'finished' | 'stale';

const META: Record<ViewKey, { rgb: string; label: string; Icon: LucideIcon; spin?: boolean; pulse?: boolean }> = {
  asking: { rgb: '217 144 30', label: 'Asking', Icon: BellRing, pulse: true },
  idle: { rgb: '120 140 165', label: 'Idle', Icon: CircleDot },
  running: { rgb: '58 109 240', label: 'Running', Icon: LoaderCircle, spin: true },
  finished: { rgb: '22 160 107', label: 'Finished', Icon: CircleCheck },
  stale: { rgb: '225 45 85', label: 'Lost', Icon: CircleHelp },
};

const ENTRYPOINT: Record<string, { Icon: LucideIcon; label: string }> = {
  cli: { Icon: Terminal, label: 'Terminal' },
  'claude-vscode': { Icon: Monitor, label: 'VS Code' },
  unknown: { Icon: Bot, label: 'Agent' },
};

function viewOf(card: SessionCard): ViewKey {
  if (card.state === 'waiting') return card.subState === 'question' ? 'asking' : 'idle';
  return card.state as ViewKey;
}

function relative(now: number, ts: number): string {
  return `${humanDuration(Math.max(0, (now - ts) / 1000))} ago`;
}

export function AgentSessionCard({ card, now, onDismiss }: { card: SessionCard; now: number; onDismiss?: (id: string) => void }) {
  const view = viewOf(card);
  const meta = META[view];
  const entry = ENTRYPOINT[card.entrypoint] ?? ENTRYPOINT.unknown;
  const terminal = view === 'finished' || view === 'stale';
  const asking = view === 'asking';

  return (
    <div
      className={`card relative overflow-hidden p-4 pl-5 transition ${terminal ? 'opacity-60' : ''}`}
      style={{ boxShadow: asking ? `0 0 0 1px ${tint(meta.rgb, 0.5)}, 0 8px 24px ${tint(meta.rgb, 0.18)}` : undefined }}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: solid(meta.rgb) }} />

      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: tint(meta.rgb, 0.16), color: solid(meta.rgb) }}
        >
          <meta.Icon size={13} className={meta.spin ? 'animate-spin' : meta.pulse ? 'animate-pulse' : ''} />
          {meta.label}
        </span>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1" title={`entry: ${card.entrypoint}`}>
            <entry.Icon size={13} /> {entry.label}
          </span>
          {card.pid != null && <span className="font-mono text-slate-500">pid {card.pid}</span>}
          {terminal && onDismiss && (
            <button onClick={() => onDismiss(card.sessionId)} className="text-slate-500 hover:text-slate-200" title="Dismiss">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* A pending question is the most important thing on the board. */}
      {asking && (
        <p className="mt-2.5 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: tint(meta.rgb, 0.12), color: 'rgb(var(--slate-100))' }}>
          {card.question || 'Has a question for you'}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
        {view === 'running' && <span>{card.lastTool ? <>running <span className="font-mono text-slate-300">{card.lastTool}</span></> : 'working…'}</span>}
        {view === 'idle' && <span>idle · waiting for your next prompt</span>}
        {view === 'finished' && <span>session ended</span>}
        {view === 'stale' && <span>process gone — may need cleanup</span>}
        <span className="text-slate-500">· {relative(now, card.updatedAt)}</span>
        <span className="ml-auto truncate font-mono text-[11px] text-slate-500" title={card.sessionId}>{card.sessionId.slice(0, 8)}</span>
      </div>
    </div>
  );
}
