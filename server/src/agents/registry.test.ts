import { describe, it, expect, beforeEach } from 'vitest';
import { parseProcStartFromStat, parseRegistryFile, isAlive, reconcile } from './registry';
import { resetStore, getCard, snapshot, applyHook } from './store';

beforeEach(() => resetStore());

describe('parseProcStartFromStat', () => {
  it('extracts field 22 (starttime) even when comm contains spaces and parens', () => {
    // pid (comm) state ppid pgrp ... fields 2..21 ... 22=starttime(432646)
    const fields = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
    const stat = `32325 (claude (vs) code) S ${fields.join(' ')} 432646 99999 more`;
    // after comm: state=S(f3), then f4..f21 = the 18 numbers, f22 = 432646
    expect(parseProcStartFromStat(stat)).toBe('432646');
  });
  it('returns null for malformed input', () => {
    expect(parseProcStartFromStat('garbage')).toBeNull();
  });
});

describe('parseRegistryFile', () => {
  it('parses a real-shaped registry file', () => {
    const content = JSON.stringify({
      pid: 32325, sessionId: 'abc', cwd: '/home/musel/Github', startedAt: 123,
      procStart: '432646', version: '2.1.177', entrypoint: 'cli', status: 'busy',
    });
    const info = parseRegistryFile(content, 32325)!;
    expect(info.sessionId).toBe('abc');
    expect(info.pid).toBe(32325);
    expect(info.entrypoint).toBe('cli');
    expect(info.procStart).toBe('432646');
    expect(info.status).toBe('busy');
  });
  it('falls back to the filename pid when the body omits it', () => {
    const info = parseRegistryFile(JSON.stringify({ sessionId: 'x', cwd: '/p' }), 777)!;
    expect(info.pid).toBe(777);
  });
  it('returns null on bad json or missing required fields', () => {
    expect(parseRegistryFile('{not json', 1)).toBeNull();
    expect(parseRegistryFile(JSON.stringify({ cwd: '/p' }), 1)).toBeNull(); // no sessionId
  });
});

// Build a /proc/<pid>/stat line whose field 22 (starttime) is `start`.
// After the comm's ')', field 3 (state) + fields 4..21 = 19 tokens, then field 22.
const statWith = (start: string) => `1 (x) ${['S', ...Array(18).fill('0')].join(' ')} ${start} 0`;

describe('isAlive', () => {
  const stat = statWith;
  it('is dead when the process is gone (no stat)', () => {
    expect(isAlive(100, '111', () => null)).toBe(false);
  });
  it('is alive when procStart matches', () => {
    expect(isAlive(100, '111', () => stat('111'))).toBe(true);
  });
  it('is dead when procStart mismatches (pid reused)', () => {
    expect(isAlive(100, '111', () => stat('999'))).toBe(false);
  });
  it('falls back to mere existence when procStart is unknown', () => {
    expect(isAlive(100, undefined, () => stat('111'))).toBe(true);
    expect(isAlive(100, undefined, () => null)).toBe(false);
  });
});

describe('reconcile', () => {
  const aliveStat = statWith;
  const file = (o: object) => ({ name: 'p.json', content: JSON.stringify(o) });

  it('creates a card for a live registry file (busy → running)', () => {
    reconcile({
      now: 1000,
      files: [file({ pid: 100, sessionId: 's1', cwd: '/home/musel/Github/timer', procStart: '111', entrypoint: 'cli', status: 'busy' })],
      readStat: () => aliveStat('111'),
    });
    expect(getCard('s1')!.state).toBe('running');
    expect(getCard('s1')!.entrypoint).toBe('cli');
  });

  it('finishes an existing card when its registry file lingers but the pid is dead', () => {
    applyHook({ hook_event_name: 'PreToolUse', session_id: 's1', cwd: '/p' }, 500);
    reconcile({
      now: 1000,
      files: [file({ pid: 100, sessionId: 's1', cwd: '/p', procStart: '111' })],
      readStat: () => null, // process gone
    });
    expect(getCard('s1')!.state).toBe('finished');
  });

  it('does not create a card for a dead lingering file we never saw', () => {
    reconcile({ now: 1000, files: [file({ pid: 100, sessionId: 'ghost', cwd: '/p', procStart: '111' })], readStat: () => null });
    expect(snapshot()).toHaveLength(0);
  });

  it('finishes a card when its registry file disappears and the pid is dead', () => {
    reconcile({ now: 1000, files: [file({ pid: 100, sessionId: 's1', cwd: '/p', procStart: '111', status: 'busy' })], readStat: () => aliveStat('111') });
    expect(getCard('s1')!.state).toBe('running');
    // next cycle: file gone, process dead
    reconcile({ now: 2000, files: [], readStat: () => null });
    expect(getCard('s1')!.state).toBe('finished');
  });
});
