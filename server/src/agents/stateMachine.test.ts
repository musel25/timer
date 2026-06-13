import { describe, it, expect } from 'vitest';
import { classifyEvent, deriveProject, applyHookEvent } from './stateMachine';
import type { RawHookPayload } from './stateMachine';

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
  it('treats SessionEnd as finished', () => {
    expect(classifyEvent(ev({ hook_event_name: 'SessionEnd' }))).toBe('finished');
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

  it('Stop records a turn boundary without changing a running state to waiting', () => {
    const running = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 100)!;
    const card = applyHookEvent(running, ev({ hook_event_name: 'Stop' }), 200)!;
    expect(card.state).toBe('running');
    expect(card.lastStopAt).toBe(200);
  });

  it('SessionEnd finalizes the card as finished and is terminal', () => {
    const running = applyHookEvent(undefined, ev({ hook_event_name: 'PreToolUse' }), 100)!;
    const ended = applyHookEvent(running, ev({ hook_event_name: 'SessionEnd' }), 200)!;
    expect(ended.state).toBe('finished');
    expect(ended.endedAt).toBe(200);
    // a stray later tool event must not resurrect a finished session
    const after = applyHookEvent(ended, ev({ hook_event_name: 'PreToolUse' }), 300)!;
    expect(after.state).toBe('finished');
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
