// Mirrors server/src/agents/stateMachine.ts SessionCard. The two packages don't
// share types, so this is kept in sync by hand (the shape is small and stable).
export type AgentState = 'running' | 'waiting' | 'finished' | 'stale';
export type WaitingKind = 'question' | 'idle';

export interface SessionCard {
  sessionId: string;
  pid?: number;
  procStart?: string;
  cwd: string;
  project: string;
  entrypoint: string; // 'cli' | 'claude-vscode' | 'unknown'
  version?: string;
  state: AgentState;
  subState?: WaitingKind;
  lastTool?: string;
  lastMessage?: string;
  question?: string;
  startedAt: number;
  lastEventAt: number;
  lastStopAt?: number;
  updatedAt: number;
  registrySeenAt: number;
  isStale: boolean;
  endedAt?: number;
  source: 'registry' | 'hook' | 'both';
}

export type Delta =
  | { type: 'upsert'; card: SessionCard }
  | { type: 'remove'; sessionId: string };

export interface ProjectGroup {
  project: string;
  cards: SessionCard[];
}
