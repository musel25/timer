import path from 'node:path';

/* The shape of a Claude Code hook payload we care about (command/http hooks both
   deliver this JSON). Extra fields are ignored. */
export interface RawHookPayload {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
  transcript_path?: string;
  notification_type?: string;
  message?: string;
  title?: string;
  tool_name?: string;
  agent_id?: string;
  agent_type?: string;
  version?: string;
}

export type AgentState = 'running' | 'waiting' | 'finished' | 'stale';
export type WaitingKind = 'question' | 'idle';
export type EventKind = 'running' | 'waiting-question' | 'waiting-idle' | 'finished' | 'turn-end' | 'ignore';
export type Source = 'registry' | 'hook' | 'both';

export interface SessionCard {
  sessionId: string; // canonical key (merges registry + hooks)
  pid?: number;
  procStart?: string;
  cwd: string;
  project: string;
  entrypoint: string; // 'cli' | 'claude-vscode' | 'unknown'
  version?: string;
  state: AgentState;
  subState?: WaitingKind; // only meaningful when state === 'waiting'
  lastTool?: string;
  lastMessage?: string;
  question?: string;
  startedAt: number;
  lastEventAt: number; // ms of last applied HOOK event (monotonic guard + state precision)
  lastStopAt?: number;
  updatedAt: number; // ms of last mutation of any kind
  registrySeenAt: number; // ms of last registry parse that saw this session
  isStale: boolean;
  endedAt?: number;
  source: Source;
}

/** Human-friendly project name = last path segment of the cwd. */
export function deriveProject(cwd: string): string {
  if (!cwd) return '';
  const base = path.basename(cwd);
  return base || cwd;
}

/** Pure mapping from a hook event to what it means for session state. */
export function classifyEvent(p: RawHookPayload): EventKind {
  switch (p.hook_event_name) {
    case 'SessionStart':
    case 'UserPromptSubmit':
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
      return 'running';
    case 'Elicitation':
      return 'waiting-question';
    case 'Notification':
      if (p.notification_type === 'idle_prompt' || p.notification_type === 'permission_prompt') return 'waiting-idle';
      if (p.notification_type === 'elicitation_dialog') return 'waiting-question';
      return 'ignore'; // auth_success, elicitation_complete/response, etc.
    case 'Stop':
      return 'turn-end';
    case 'SessionEnd':
      // Unreliable for existence: also fires on /clear, resume, and VS Code panel
      // reloads while the session keeps running. Whether a session is really gone is
      // decided by the registry (pid liveness), not this event — so ignore it.
      return 'ignore';
    default:
      return 'ignore';
  }
}

function freshCard(p: RawHookPayload, receivedAt: number): SessionCard {
  const cwd = p.cwd ?? '';
  return {
    sessionId: p.session_id,
    cwd,
    project: deriveProject(cwd),
    entrypoint: 'unknown',
    version: p.version,
    state: 'running',
    startedAt: receivedAt,
    lastEventAt: 0,
    updatedAt: receivedAt,
    registrySeenAt: 0,
    isStale: false,
    source: 'hook',
  };
}

/**
 * Apply a hook event to a card, returning the next card (immutable) or null when
 * the event is ignorable and no card exists yet.
 *
 * Rules (see design): `idle_prompt`/`Elicitation` = waiting, `Stop` = turn boundary
 * only, `SessionEnd` = terminal finished. Latest-arrival wins; out-of-order events
 * older than the last applied event are dropped; finished is terminal.
 */
export function applyHookEvent(
  prev: SessionCard | undefined,
  p: RawHookPayload,
  receivedAt: number,
): SessionCard | null {
  const kind = classifyEvent(p);
  if (kind === 'ignore') return prev ?? null;

  // A finished card stays finished UNLESS a newer running-class event proves the
  // session is active again — SessionEnd also fires on /clear and resume, after which
  // the session keeps going. Non-activity events (idle/turn-end) don't resurrect it.
  if (prev?.state === 'finished' && kind !== 'running') return prev;

  // Monotonic guard: drop events that arrived out of order (older than last applied),
  // except a 'finished' which always wins.
  if (prev && kind !== 'finished' && receivedAt < prev.lastEventAt) return prev;

  const base = prev ?? freshCard(p, receivedAt);
  const source: Source = !prev ? 'hook' : prev.source === 'registry' ? 'both' : prev.source;

  const next: SessionCard = {
    ...base,
    // The spawn cwd (set on creation / by the registry) is authoritative for
    // grouping — don't relabel the project if the session later cd's elsewhere.
    cwd: base.cwd || p.cwd || '',
    project: base.cwd ? base.project : deriveProject(p.cwd || ''),
    version: p.version ?? base.version,
    source,
    isStale: false,
    updatedAt: receivedAt,
    lastEventAt: receivedAt,
  };

  switch (kind) {
    case 'running':
      next.state = 'running';
      next.subState = undefined;
      next.question = undefined;
      next.endedAt = undefined;
      if (p.tool_name) next.lastTool = p.tool_name;
      break;
    case 'waiting-question':
      next.state = 'waiting';
      next.subState = 'question';
      if (p.message) {
        next.question = p.message;
        next.lastMessage = p.message;
      }
      break;
    case 'waiting-idle':
      next.state = 'waiting';
      next.subState = 'idle';
      next.question = undefined;
      next.lastMessage = p.message ?? 'Waiting for your input';
      break;
    case 'finished':
      next.state = 'finished';
      next.subState = undefined;
      next.question = undefined;
      next.endedAt = receivedAt;
      break;
    case 'turn-end':
      // Stop = the agent finished responding and is now waiting for you. Record the
      // turn boundary and flip to waiting/idle — UNLESS a question is still pending
      // (an unanswered Elicitation must stay 'question', not be downgraded to idle).
      next.lastStopAt = receivedAt;
      if (!(prev && prev.state === 'waiting' && prev.subState === 'question')) {
        next.state = 'waiting';
        next.subState = 'idle';
        next.question = undefined;
      }
      break;
  }

  return next;
}
