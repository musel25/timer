import { describe, expect, it } from 'vitest';
import type { DesktopTask } from '../../lib/types';
import { addTask, removeTask, renameTask, taskProgress, toggleTask } from './cardOps';

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

describe('renameTask', () => {
  it('replaces the text of one task and leaves the rest untouched', () => {
    const out = renameTask(tasks, 'a', 'redesign');
    expect(out.find((t) => t.id === 'a')?.text).toBe('redesign');
    expect(out.find((t) => t.id === 'a')?.done).toBe(true);
    expect(out.find((t) => t.id === 'b')?.text).toBe('build');
    expect(tasks.find((t) => t.id === 'a')?.text).toBe('design');
  });
});

describe('taskProgress', () => {
  it('counts the ticked tasks', () => {
    expect(taskProgress(tasks)).toEqual({ done: 2, total: 3 });
    expect(taskProgress([])).toEqual({ done: 0, total: 0 });
  });

  it('ignores any subtasks a row cached before the redesign still carries', () => {
    const legacy: DesktopTask[] = [
      { id: 'a', text: 'build', done: false, subtasks: [{ id: 'a1', text: 'step', done: true }] },
    ];
    expect(taskProgress(legacy)).toEqual({ done: 0, total: 1 });
  });
});
