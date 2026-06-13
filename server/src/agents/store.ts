import { applyHookEvent, deriveProject } from './stateMachine';
import type { RawHookPayload, SessionCard, Source } from './stateMachine';

/** Subset of a `~/.claude/sessions/{pid}.json` file we use. */
export interface RegistryInfo {
  sessionId: string;
  pid: number;
  procStart?: string;
  cwd: string;
  entrypoint?: string;
  version?: string;
  startedAt?: number;
  status?: string; // CLI writes 'busy'; VS Code writes nothing
}

export type Delta =
  | { type: 'upsert'; card: SessionCard }
  | { type: 'remove'; sessionId: string };

const FINISHED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FINISHED = 100;

const cards = new Map<string, SessionCard>();
const listeners = new Set<(d: Delta) => void>();

function emit(d: Delta): void {
  for (const fn of listeners) {
    try { fn(d); } catch { /* a bad listener must not break the store */ }
  }
}

export function subscribe(fn: (d: Delta) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function snapshot(): SessionCard[] {
  return [...cards.values()];
}

export function getCard(sessionId: string): SessionCard | undefined {
  return cards.get(sessionId);
}

/** Test/lifecycle helper — wipe all state. */
export function resetStore(): void {
  cards.clear();
}

function put(card: SessionCard): SessionCard {
  cards.set(card.sessionId, card);
  emit({ type: 'upsert', card });
  return card;
}

/** Ingest a Claude Code hook event. Returns the resulting card, or null if ignored. */
export function applyHook(p: RawHookPayload, receivedAt: number): SessionCard | null {
  const prev = cards.get(p.session_id);
  const next = applyHookEvent(prev, p, receivedAt);
  if (!next) return null;
  if (next === prev) return prev; // no-op (e.g. terminal/finished) — don't emit
  return put(next);
}

/** Merge a registry entry. Enriches identity/liveness without clobbering hook state. */
export function applyRegistry(info: RegistryInfo, now: number): SessionCard {
  // Supersede: if this pid now reports a different session id, the old one is gone
  // (e.g. the user ran /clear or started a new session in the same window).
  if (info.pid != null) {
    for (const c of cards.values()) {
      if (c.pid === info.pid && c.sessionId !== info.sessionId && c.state !== 'finished') {
        finishCard(c.sessionId, now, `supersede-by-${info.sessionId.slice(0, 8)}(pid ${info.pid})`);
      }
    }
  }

  const prev = cards.get(info.sessionId);
  const source: Source = !prev ? 'registry' : prev.source === 'hook' ? 'both' : prev.source;
  const base: SessionCard = prev ?? {
    sessionId: info.sessionId,
    cwd: info.cwd,
    project: deriveProject(info.cwd),
    entrypoint: 'unknown',
    state: 'running',
    startedAt: info.startedAt ?? now,
    lastEventAt: 0,
    updatedAt: now,
    registrySeenAt: now,
    isStale: false,
    source: 'registry',
  };

  const next: SessionCard = {
    ...base,
    pid: info.pid,
    procStart: info.procStart ?? base.procStart,
    cwd: info.cwd || base.cwd,
    project: deriveProject(info.cwd || base.cwd),
    entrypoint: info.entrypoint ?? base.entrypoint,
    version: info.version ?? base.version,
    startedAt: base.startedAt || info.startedAt || now,
    registrySeenAt: now,
    updatedAt: now,
    isStale: false,
    source,
  };

  // The registry only seeds state when no hook has spoken for this session yet.
  // It has no precise signal, so don't blindly claim "running": trust the CLI's
  // 'busy' flag, and otherwise (VS Code, which reports no status, or an idle CLI)
  // treat the session as idle/waiting rather than actively working.
  if (base.lastEventAt === 0 && base.state !== 'finished') {
    if (info.status === 'busy') {
      next.state = 'running';
      next.subState = undefined;
    } else {
      next.state = 'waiting';
      next.subState = 'idle';
    }
  }

  // reconcile only calls applyRegistry for LIVE processes (pid + procStart verified),
  // so a card that hooks marked terminal is a false end — SessionEnd fires on /clear,
  // resume, and VS Code panel reloads while the session keeps running. The registry is
  // authoritative for existence: bring a live-but-"finished/stale" session back.
  if (prev && (prev.state === 'finished' || prev.state === 'stale')) {
    next.endedAt = undefined;
    next.isStale = false;
    next.state = info.status === 'busy' ? 'running' : 'waiting';
    next.subState = info.status === 'busy' ? undefined : 'idle';
  }

  return put(next);
}

/** Mark a session finished — its process is gone (dead pid) or it was superseded. */
export function finishCard(sessionId: string, now: number, reason = ''): void {
  const c = cards.get(sessionId);
  if (!c || c.state === 'finished') return;
  if (process.env.CC_DASH_LOG) console.error('[cc] finish', sessionId.slice(0, 8), `pid=${c.pid}`, reason);
  put({ ...c, state: 'finished', subState: undefined, question: undefined, endedAt: now, updatedAt: now });
}

export function removeCard(sessionId: string): void {
  if (cards.delete(sessionId)) emit({ type: 'remove', sessionId });
}

/** Drop finished/stale cards older than the TTL, and cap the finished backlog. */
export function prune(now: number): void {
  const dead: SessionCard[] = [];
  for (const c of cards.values()) {
    const terminal = c.state === 'finished' || c.state === 'stale';
    if (terminal && now - (c.endedAt ?? c.updatedAt) > FINISHED_TTL_MS) dead.push(c);
  }
  for (const c of dead) removeCard(c.sessionId);

  const finished = snapshot()
    .filter((c) => c.state === 'finished' || c.state === 'stale')
    .sort((a, b) => (b.endedAt ?? b.updatedAt) - (a.endedAt ?? a.updatedAt));
  for (const c of finished.slice(MAX_FINISHED)) removeCard(c.sessionId);
}
