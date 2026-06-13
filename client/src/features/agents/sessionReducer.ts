import type { SessionCard } from './types';

/** Cards keyed by sessionId — the shape held by the dashboard while connected. */
export type SessionState = Record<string, SessionCard>;

/**
 * Fold one Server-Sent Event into the session map. Pure and total: unknown events
 * and malformed payloads return the previous state unchanged (referential equality
 * preserved, so React can bail out of re-renders).
 */
export function reduceEvent(state: SessionState, event: string, data: string): SessionState {
  try {
    switch (event) {
      case 'snapshot': {
        const arr = JSON.parse(data) as SessionCard[];
        const next: SessionState = {};
        for (const c of arr) next[c.sessionId] = c;
        return next;
      }
      case 'upsert': {
        const { card } = JSON.parse(data) as { card: SessionCard };
        return { ...state, [card.sessionId]: card };
      }
      case 'remove': {
        const { sessionId } = JSON.parse(data) as { sessionId: string };
        if (!(sessionId in state)) return state;
        const next = { ...state };
        delete next[sessionId];
        return next;
      }
      default:
        return state; // ping, comments, unknown
    }
  } catch {
    return state;
  }
}
