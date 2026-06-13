import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAgentSessions } from './useAgentSessions';
import { useWaitingAlerts, loadMuted, saveMuted } from './alerts';
import type { SessionCard } from './types';

interface AgentsValue {
  cards: SessionCard[];
  connected: boolean;
  muted: boolean;
  setMuted: (m: boolean) => void;
}

const Ctx = createContext<AgentsValue | null>(null);

/**
 * App-wide (dev-only) provider: one SSE connection + one alert host, so a session
 * needing attention notifies you anywhere in the app, the tab badge is global, and
 * both the nav badge and the dashboard read the same live state.
 */
export function AgentsProvider({ children }: { children: ReactNode }) {
  const { cards, connected } = useAgentSessions();
  const [muted, setMutedState] = useState(loadMuted);
  useWaitingAlerts(cards, muted);

  const setMuted = (m: boolean) => { setMutedState(m); saveMuted(m); };

  return <Ctx.Provider value={{ cards, connected, muted, setMuted }}>{children}</Ctx.Provider>;
}

/** Strict accessor — use inside the dashboard, which only renders under the provider. */
export function useAgents(): AgentsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAgents must be used within AgentsProvider');
  return v;
}

/** Null-safe accessor — use in shared chrome (e.g. Layout) that also renders in prod. */
export function useAgentsOptional(): AgentsValue | null {
  return useContext(Ctx);
}
