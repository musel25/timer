import type { AgentState, ProjectGroup, SessionCard } from './types';

// Display priority: an agent asking you something first, then idle (finished its
// turn, awaiting you), then actively running, then lost, then finished.
function rankOf(c: SessionCard): number {
  if (c.state === 'waiting') return c.subState === 'question' ? 0 : 1;
  if (c.state === 'running') return 2;
  if (c.state === 'stale') return 3;
  return 4; // finished
}

/** Asking → idle → running → stale → finished; ties by most recent activity. */
export function sortCards(cards: SessionCard[]): SessionCard[] {
  return [...cards].sort((a, b) => rankOf(a) - rankOf(b) || b.updatedAt - a.updatedAt);
}

/**
 * Group cards by project. Groups containing a waiting session float to the top;
 * otherwise groups are ordered by their most recently active card. Cards within a
 * group are sorted with {@link sortCards}.
 */
export function groupByProject(cards: SessionCard[]): ProjectGroup[] {
  const byProject = new Map<string, SessionCard[]>();
  for (const c of cards) {
    const list = byProject.get(c.project) ?? [];
    list.push(c);
    byProject.set(c.project, list);
  }
  const groups: ProjectGroup[] = [...byProject.entries()].map(([project, list]) => ({ project, cards: sortCards(list) }));
  return groups.sort((a, b) => {
    const ra = Math.min(...a.cards.map(rankOf));
    const rb = Math.min(...b.cards.map(rankOf));
    if (ra !== rb) return ra - rb;
    const ua = Math.max(...a.cards.map((c) => c.updatedAt));
    const ub = Math.max(...b.cards.map((c) => c.updatedAt));
    return ub - ua;
  });
}

export interface Tally { asking: number; idle: number; running: number; finished: number; stale: number; }

/** Per-bucket counts, splitting waiting into asking (a question) vs idle. */
export function tally(cards: SessionCard[]): Tally {
  const t: Tally = { asking: 0, idle: 0, running: 0, finished: 0, stale: 0 };
  for (const c of cards) {
    if (c.state === 'waiting') c.subState === 'question' ? t.asking++ : t.idle++;
    else if (c.state === 'running') t.running++;
    else if (c.state === 'stale') t.stale++;
    else t.finished++;
  }
  return t;
}

export function countByState(cards: SessionCard[]): Record<AgentState, number> {
  const counts: Record<AgentState, number> = { waiting: 0, running: 0, finished: 0, stale: 0 };
  for (const c of cards) counts[c.state]++;
  return counts;
}

/** Total waiting (asking + idle). */
export function waitingCount(cards: SessionCard[]): number {
  return cards.reduce((n, c) => n + (c.state === 'waiting' ? 1 : 0), 0);
}

/** Sessions blocked asking you a question — the ones worth an alert/badge. */
export function askingCount(cards: SessionCard[]): number {
  return cards.reduce((n, c) => n + (c.state === 'waiting' && c.subState === 'question' ? 1 : 0), 0);
}
