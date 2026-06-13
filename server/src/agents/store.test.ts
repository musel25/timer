import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetStore, snapshot, subscribe, applyHook, applyRegistry, prune, getCard, finishCard,
} from './store';
import type { RawHookPayload } from './stateMachine';
import type { RegistryInfo } from './store';

function hook(p: Partial<RawHookPayload>): RawHookPayload {
  return { hook_event_name: 'PreToolUse', session_id: 's1', cwd: '/home/musel/Github/timer', ...p };
}
function reg(p: Partial<RegistryInfo>): RegistryInfo {
  return { sessionId: 's1', pid: 100, procStart: '111', cwd: '/home/musel/Github/timer', entrypoint: 'cli', ...p };
}

beforeEach(() => resetStore());

describe('applyHook', () => {
  it('creates a card and surfaces it in the snapshot', () => {
    applyHook(hook({ tool_name: 'Bash' }), 100);
    const snap = snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].sessionId).toBe('s1');
    expect(snap[0].state).toBe('running');
    expect(snap[0].lastTool).toBe('Bash');
  });

  it('emits an upsert delta to subscribers', () => {
    const seen: string[] = [];
    const unsub = subscribe((d) => { if (d.type === 'upsert') seen.push(d.card.sessionId); });
    applyHook(hook({}), 100);
    expect(seen).toEqual(['s1']);
    unsub();
    applyHook(hook({}), 200);
    expect(seen).toEqual(['s1']); // no longer notified after unsubscribe
  });

  it('does not create a card (or emit) for ignorable events', () => {
    let emitted = 0;
    subscribe(() => { emitted++; });
    const r = applyHook(hook({ hook_event_name: 'Notification', notification_type: 'auth_success' }), 100);
    expect(r).toBeNull();
    expect(snapshot()).toHaveLength(0);
    expect(emitted).toBe(0);
  });
});

describe('applyRegistry', () => {
  it('creates a registry-sourced card with project + entrypoint + pid; busy → running', () => {
    applyRegistry(reg({ status: 'busy' }), 100);
    const card = getCard('s1')!;
    expect(card.source).toBe('registry');
    expect(card.project).toBe('timer');
    expect(card.entrypoint).toBe('cli');
    expect(card.pid).toBe(100);
    expect(card.procStart).toBe('111');
    expect(card.state).toBe('running');
  });

  it('seeds a status-less registry session (e.g. VS Code) as idle, not running', () => {
    applyRegistry(reg({ entrypoint: 'claude-vscode' }), 100);
    const card = getCard('s1')!;
    expect(card.state).toBe('waiting');
    expect(card.subState).toBe('idle');
  });

  it('merges with a hook card without clobbering hook-driven state', () => {
    applyHook(hook({ hook_event_name: 'Elicitation', message: 'Which auth?' }), 200);
    applyRegistry(reg({ entrypoint: 'claude-vscode' }), 300);
    const card = getCard('s1')!;
    expect(card.state).toBe('waiting'); // hook state preserved
    expect(card.subState).toBe('question');
    expect(card.question).toBe('Which auth?');
    expect(card.entrypoint).toBe('claude-vscode'); // registry enrichment applied
    expect(card.pid).toBe(100);
    expect(card.source).toBe('both');
  });

  it('lets a subsequent hook own the state (registry only seeds when no hook yet)', () => {
    applyRegistry(reg({ status: 'busy' }), 100); // running (seeded from status)
    applyHook(hook({ hook_event_name: 'Stop' }), 200); // hook says the turn ended
    expect(getCard('s1')!.state).toBe('waiting');
    expect(getCard('s1')!.subState).toBe('idle');
    expect(getCard('s1')!.source).toBe('both');
  });

  it('resurrects a finished session the registry still reports alive (e.g. a transient dead read → busy=running)', () => {
    applyHook(hook({}), 100); // running
    finishCard('s1', 150); // a transient pid-dead reading finished it
    expect(getCard('s1')!.state).toBe('finished');
    applyRegistry(reg({ status: 'busy' }), 200); // reconcile only runs for live pids
    expect(getCard('s1')!.state).toBe('running');
    expect(getCard('s1')!.endedAt).toBeUndefined();
  });

  it('resurrects a status-less (VS Code) finished session as idle', () => {
    applyHook(hook({}), 100);
    finishCard('s1', 150);
    applyRegistry(reg({ entrypoint: 'claude-vscode' }), 200);
    expect(getCard('s1')!.state).toBe('waiting');
    expect(getCard('s1')!.subState).toBe('idle');
  });

  it('supersedes an older session sharing the same pid (e.g. after /clear)', () => {
    applyRegistry(reg({ sessionId: 'old', pid: 555, status: 'busy' }), 100);
    applyRegistry(reg({ sessionId: 'new', pid: 555, status: 'busy' }), 200);
    expect(getCard('old')!.state).toBe('finished');
    expect(getCard('new')!.state).toBe('running');
  });
});

describe('prune', () => {
  it('removes finished cards older than the TTL but keeps live ones', () => {
    applyHook(hook({ session_id: 'live' }), 1_000);
    applyHook(hook({ session_id: 'done' }), 1_000);
    finishCard('done', 1_000);
    const dayLater = 1_000 + 25 * 60 * 60 * 1000;
    prune(dayLater);
    const ids = snapshot().map((c) => c.sessionId).sort();
    expect(ids).toEqual(['live']);
  });
});
