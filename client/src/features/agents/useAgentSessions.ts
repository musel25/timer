import { useEffect, useReducer, useState } from 'react';
import { reduceEvent, type SessionState } from './sessionReducer';
import type { SessionCard } from './types';

export interface AgentSessions {
  cards: SessionCard[];
  connected: boolean;
}

/**
 * Live view of all Claude Code sessions, fed by the server SSE stream (`/cc/stream`)
 * with a one-shot `/cc/snapshot` fallback. EventSource reconnects on its own, so we
 * only track the connected flag for the UI. Returns plain arrays — sorting/grouping
 * is the caller's job (see sessionView).
 */
export function useAgentSessions(): AgentSessions {
  const [state, dispatch] = useReducer(
    (s: SessionState, e: { event: string; data: string }) => reduceEvent(s, e.event, e.data),
    {} as SessionState,
  );
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let stopped = false;

    // Fallback in case SSE is blocked/buffered by a proxy — shows current state fast.
    fetch('/cc/snapshot', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => { if (!stopped) dispatch({ event: 'snapshot', data: JSON.stringify(arr) }); })
      .catch(() => { /* not logged in / server down — SSE will fill in */ });

    const es = new EventSource('/cc/stream', { withCredentials: true });
    es.addEventListener('open', () => !stopped && setConnected(true));
    es.addEventListener('error', () => !stopped && setConnected(false));
    const on = (event: string) => es.addEventListener(event, (e: MessageEvent) => dispatch({ event, data: e.data }));
    on('snapshot');
    on('upsert');
    on('remove');

    return () => { stopped = true; es.close(); };
  }, []);

  return { cards: Object.values(state), connected };
}
