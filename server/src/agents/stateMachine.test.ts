import { describe, it, expect } from 'vitest';
import { classifyEvent, deriveProject, applyHookEvent } from './stateMachine';
import type { RawHookPayload, SessionCard } from './stateMachine';

function ev(p: Partial<RawHookPayload>): RawHookPayload {
  return { hook_event_name: 'PreToolUse', session_id: 's1', cwd: '/home/musel/Github/timer', ...p };
}

describe('deriveProject', () => {
  it('uses the last path segment', () => {
    expect(deriveProject('/home/musel/Github/timer')).toBe('timer');
    expect(deriveProject('/home/musel/Github/a2a-scratch')).toBe('a2a-scratch');
  });
  it('falls back to the raw path when there is no segment', () => {
    expect(deriveProject('/')).toBe('/');
    expect(deriveProject('')).toBe('');
  });
});

describe('classifyEvent', () => {
  it('treats tool + prompt + session-start events as running', () => {
    for (const name of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure']) {
      expect(classifyEvent(ev({ hook_event_name: name }))).toBe('running');
    }
  });
  it('treats Elicitation as a waiting question', () => {
    expect(classifyEvent(ev({ hook_event_name: 'Elicitation' }))).toBe('waiting-question');
  });
  it('maps Notification by notification_type', () => {
    expect(classifyEvent(ev({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }))).toBe('waiting-idle');
    expect(classifyEvent(ev({ hook_event_name: 'Notification', notification_type: 'elicitation_dialog' }))).toBe('waiting-question');
    expect(classifyEvent(ev({ hook_event_name: 'Notification', notification_type: 'auth_success' }))).toBe('ignore');
  });
  it('treats Stop as a turn boundary, not finished/waiting', () => {
    expect(classifyEvent(ev({ hook_event_name: 'Stop' }))).toBe('turn-end');
  });
  it('ignores SessionEnd (existence is decided by the registry, not this event)', () => {
    expect(classifyEvent(ev({ hook_event_name: 'SessionEnd' }))).toBe('ignore');
  });
  it('ignores unknown events', () => {
    expect(classifyEvent(ev({ hook_event_name: 'PreCompact' }))).toBe('ignore');
  });
});

describe('applyHookEvent', () => {
  it('creates a running card from a PreToolUse, deriving project + capturing the tool', () => {
    const card = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse', tool_name: 'Bash' }), 100);
    expect(card).not.toBeNull();
    expect(card!.sessionId).toBe('s1');
    expect(card!.project).toBe('timer');
    expect(card!.state).toBe('running');
    expect(card!.lastTool).toBe('Bash');
    expect(card!.source).toBe('hook');
    expect(card!.lastEventAt).toBe(100);
  });

  it('does not create a card for ignorable events', () => {
    expect(applyHookEvent(undefined, ev({ hook_event_name: 'Notification', notification_type: 'auth_success' }), 100)).toBeNull();
  });

  it('flips to waiting/question on Elicitation and captures the message', () => {
    const running = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 100)!;
    const card = applyHookEvent(running, ev({ hook_event_name: 'Elicitation', message: 'Which auth method?' }), 200)!;
    expect(card.state).toBe('waiting');
    expect(card.subState).toBe('question');
    expect(card.question).toBe('Which auth method?');
  });

  it('flips to waiting/idle on Notification idle_prompt', () => {
    const running = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 100)!;
    const card = applyHookEvent(running, ev({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'waiting' }), 200)!;
    expect(card.state).toBe('waiting');
    expect(card.subState).toBe('idle');
  });

  it('returns to running from waiting when a new tool runs, clearing the question', () => {
    const waiting = applyHookEvent(undefined, ev({ hook_event_name: 'Elicitation', message: 'q?' }), 100)!;
    const card = applyHookEvent(waiting, ev({ hook_event_name: 'PreToolUse', tool_name: 'Edit' }), 200)!;
    expect(card.state).toBe('running');
    expect(card.subState).toBeUndefined();
    expect(card.question).toBeUndefined();
  });

  it('Stop ends the turn → waiting/idle (the agent is now waiting for you)', () => {
    const running = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 100)!;
    const card = applyHookEvent(running, ev({ hook_event_name: 'Stop' }), 200)!;
    expect(card.state).toBe('waiting');
    expect(card.subState).toBe('idle');
    expect(card.lastStopAt).toBe(200);
  });

  it('Stop does not downgrade a pending question to idle', () => {
    const asking = applyHookEvent(undefined, ev({ hook_event_name: 'Elicitation', message: 'q?' }), 100)!;
    const card = applyHookEvent(asking, ev({ hook_event_name: 'Stop' }), 200)!;
    expect(card.state).toBe('waiting');
    expect(card.subState).toBe('question');
    expect(card.question).toBe('q?');
  });

  it('keeps the spawn cwd; a later hook from a different dir does not relabel the project', () => {
    const a = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse', cwd: '/home/musel/Github' }), 100)!;
    expect(a.project).toBe('Github');
    const b = applyHookEvent(a, ev({ hook_event_name: 'PreToolUse', cwd: '/home/musel/Github/timer/server' }), 200)!;
    expect(b.cwd).toBe('/home/musel/Github');
    expect(b.project).toBe('Github');
  });

  it('ignores SessionEnd — keeps current state (the registry decides if it really ended)', () => {
    const running = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 100)!;
    const after = applyHookEvent(running, ev({ hook_event_name: 'SessionEnd' }), 200)!;
    expect(after.state).toBe('running');
    expect(after.endedAt).toBeUndefined();
  });

  it('a finished card is resurrected by a newer activity event, but not an older (out-of-order) one', () => {
    const finished: SessionCard = {
      ...applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 100)!,
      state: 'finished', endedAt: 200, lastEventAt: 200,
    };
    expect(applyHookEvent(finished, ev({ hook_event_name: 'PreToolUse' }), 150)!.state).toBe('finished');
    const resumed = applyHookEvent(finished, ev({ hook_event_name: 'PreToolUse' }), 300)!;
    expect(resumed.state).toBe('running');
    expect(resumed.endedAt).toBeUndefined();
  });

  it('ignores out-of-order waiting events older than the last applied event', () => {
    const running = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 300)!;
    // an idle_prompt that was delayed in transit (older timestamp) must not flip state
    const card = applyHookEvent(running, ev({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }), 200)!;
    expect(card.state).toBe('running');
  });

  it('marks the card not stale on any live event', () => {
    const stale = { ...applyHookEvent(undefined, ev({}), 100)!, isStale: true };
    const card = applyHookEvent(stale, ev({ hook_event_name: 'PostToolUse' }), 200)!;
    expect(card.isStale).toBe(false);
  });
});
