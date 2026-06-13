import type { AgentState, ProjectGroup, SessionCard } from './types';

// Display priority: the things that need you first, the dead weight last.
const STATE_RANK: Record<AgentState, number> = { waiting: 0, running: 1, stale: 2, finished: 3 };

/** Waiting first, then running, then stale, then finished; ties by most recent activity. */
export function sortCards(cards: SessionCard[]): SessionCard[] {
  return [...cards].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || b.updatedAt - a.updatedAt);
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
    const ra = Math.min(...a.cards.map((c) => STATE_RANK[c.state]));
    const rb = Math.min(...b.cards.map((c) => STATE_RANK[c.state]));
    if (ra !== rb) return ra - rb;
    const ua = Math.max(...a.cards.map((c) => c.updatedAt));
    const ub = Math.max(...b.cards.map((c) => c.updatedAt));
    return ub - ua;
  });
}

export function countByState(cards: SessionCard[]): Record<AgentState, number> {
  const counts: Record<AgentState, number> = { waiting: 0, running: 0, finished: 0, stale: 0 };
  for (const c of cards) counts[c.state]++;
  return counts;
}

export function waitingCount(cards: SessionCard[]): number {
  return cards.reduce((n, c) => n + (c.state === 'waiting' ? 1 : 0), 0);
}
