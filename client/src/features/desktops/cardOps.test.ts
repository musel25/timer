import { describe, expect, it } from 'vitest';
import type { DesktopTask } from '../../lib/types';
import {
  addSubtask, addTask, removeSubtask, removeTask, renameSubtask, renameTask,
  subtaskProgress, taskProgress, toggleSubtask, toggleTask,
} from './cardOps';

const tasks: DesktopTask[] = [
  { id: 'a', text: 'design', done: true },
  { id: 'b', text: 'build', done: false, subtasks: [
    { id: 'b1', text: 'scaffold', done: true },
    { id: 'b2', text: 'wire it up', done: false },
  ] },
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

  it('leaves the subtasks alone — a parent is checked off in its own right', () => {
    expect(toggleTask(tasks, 'b').find((t) => t.id === 'b')?.subtasks)
      .toEqual([{ id: 'b1', text: 'scaffold', done: true }, { id: 'b2', text: 'wire it up', done: false }]);
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

  it('starts it with an empty subtask list', () => {
    expect(addTask(tasks, 'test it')[3].subtasks).toEqual([]);
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

describe('addSubtask', () => {
  it('appends under the matching parent', () => {
    const out = addSubtask(tasks, 'b', 'write the test');
    const subs = out.find((t) => t.id === 'b')?.subtasks ?? [];
    expect(subs.map((s) => s.text)).toEqual(['scaffold', 'wire it up', 'write the test']);
    expect(subs[2].done).toBe(false);
    expect(subs[2].id).toBeTruthy();
  });

  it('starts the list on a task that has none yet', () => {
    const out = addSubtask(tasks, 'a', 'sketch');
    expect(out.find((t) => t.id === 'a')?.subtasks).toEqual([
      { id: expect.any(String), text: 'sketch', done: false },
    ]);
  });
});

describe('toggleSubtask', () => {
  it('flips only the matching subtask', () => {
    const subs = toggleSubtask(tasks, 'b', 'b2').find((t) => t.id === 'b')?.subtasks ?? [];
    expect(subs.find((s) => s.id === 'b2')?.done).toBe(true);
    expect(subs.find((s) => s.id === 'b1')?.done).toBe(true);
    expect(tasks[1].subtasks?.[1].done).toBe(false);
  });
});

describe('renameSubtask', () => {
  it('replaces the text of one subtask', () => {
    const subs = renameSubtask(tasks, 'b', 'b1', 'scaffold the module').find((t) => t.id === 'b')?.subtasks ?? [];
    expect(subs.map((s) => s.text)).toEqual(['scaffold the module', 'wire it up']);
  });
});

describe('removeSubtask', () => {
  it('drops the matching subtask and keeps the parent', () => {
    const out = removeSubtask(tasks, 'b', 'b1');
    expect(out.find((t) => t.id === 'b')?.subtasks?.map((s) => s.id)).toEqual(['b2']);
    expect(out).toHaveLength(3);
  });
});

describe('taskProgress', () => {
  it('counts top-level tasks only — subtasks are a breakdown, not extra work', () => {
    expect(taskProgress(tasks)).toEqual({ done: 2, total: 3 });
    expect(taskProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe('subtaskProgress', () => {
  it('counts one task’s subtasks', () => {
    expect(subtaskProgress(tasks[1])).toEqual({ done: 1, total: 2 });
  });

  it('reads a missing list as empty (rows cached before subtasks existed)', () => {
    expect(subtaskProgress(tasks[0])).toEqual({ done: 0, total: 0 });
  });
});
