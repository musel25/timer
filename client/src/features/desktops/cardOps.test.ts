import { describe, expect, it } from 'vitest';
import type { DesktopComment, DesktopTask } from '../../lib/types';
import { addComment, addTask, removeTask, taskProgress, toggleTask } from './cardOps';

const tasks: DesktopTask[] = [
  { id: 'a', text: 'design', done: true },
  { id: 'b', text: 'build', done: false },
  { id: 'c', text: 'ship', done: true },
];

describe('toggleTask', () => {
  it('flips only the matching task and returns a new array', () => {
    const out = toggleTask(tasks, 'b');
    expect(out.find((t) => t.id === 'b')?.done).toBe(true);
    expect(out.find((t) => t.id === 'a')?.done).toBe(true);
    expect(out).not.toBe(tasks);
    expect(tasks.find((t) => t.id === 'b')?.done).toBe(false);
  });
});

describe('addTask', () => {
  it('appends an unchecked task with a fresh id', () => {
    const out = addTask(tasks, 'test it');
    expect(out).toHaveLength(4);
    expect(out[3].text).toBe('test it');
    expect(out[3].done).toBe(false);
    expect(out[3].id).toBeTruthy();
    expect(new Set(out.map((t) => t.id)).size).toBe(4);
  });
});

describe('removeTask', () => {
  it('drops the matching task', () => {
    expect(removeTask(tasks, 'b').map((t) => t.id)).toEqual(['a', 'c']);
  });
});

describe('addComment', () => {
  it('prepends (newest first) with the given timestamp', () => {
    const log: DesktopComment[] = [{ id: 'old', text: 'earlier', at: 1000 }];
    const out = addComment(log, 'just now', 2000);
    expect(out[0].text).toBe('just now');
    expect(out[0].at).toBe(2000);
    expect(out[1].id).toBe('old');
    expect(log).toHaveLength(1);
  });
});

describe('taskProgress', () => {
  it('counts done vs total', () => {
    expect(taskProgress(tasks)).toEqual({ done: 2, total: 3 });
    expect(taskProgress([])).toEqual({ done: 0, total: 0 });
  });
});
