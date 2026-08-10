import { describe, expect, it } from 'vitest';
import { applyReorder, columnOrder, moveWithin, numberOf } from './order';
import type { Task } from './types';

function task(p: Partial<Task> & { id: string }): Task {
  return {
    title: p.id,
    notes: null,
    date: null,
    done: false,
    completedAt: null,
    hiddenOn: null,
    archivedAt: null,
    sortOrder: 0,
    createdAt: 0,
    ...p,
  };
}

describe('columnOrder', () => {
  it('sorts by sortOrder', () => {
    const list = [task({ id: 'c', sortOrder: 2 }), task({ id: 'a', sortOrder: 0 }), task({ id: 'b', sortOrder: 1 })];
    expect(columnOrder(list).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('sinks done tasks below undone ones regardless of sortOrder', () => {
    const list = [
      task({ id: 'done-first', done: true, sortOrder: 0 }),
      task({ id: 'todo', done: false, sortOrder: 5 }),
    ];
    expect(columnOrder(list).map((t) => t.id)).toEqual(['todo', 'done-first']);
  });

  it('does not mutate the input array', () => {
    const list = [task({ id: 'b', sortOrder: 1 }), task({ id: 'a', sortOrder: 0 })];
    columnOrder(list);
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('numberOf', () => {
  const list = [
    task({ id: 'a', sortOrder: 0 }),
    task({ id: 'b', sortOrder: 1 }),
    task({ id: 'x', done: true, sortOrder: 2 }),
    task({ id: 'c', sortOrder: 3 }),
  ];

  it('numbers undone tasks 1..n in column order', () => {
    const ordered = columnOrder(list);
    expect(ordered.map((t) => numberOf(ordered, t))).toEqual([1, 2, 3, null]);
  });

  it('gives done tasks no number', () => {
    const ordered = columnOrder(list);
    expect(numberOf(ordered, ordered[3])).toBeNull();
  });

  it('stays gapless when a middle task is completed', () => {
    const withDone = list.map((t) => (t.id === 'b' ? { ...t, done: true } : t));
    const ordered = columnOrder(withDone);
    expect(ordered.filter((t) => !t.done).map((t) => numberOf(ordered, t))).toEqual([1, 2]);
  });
});

describe('moveWithin', () => {
  it('moves an item down', () => {
    expect(moveWithin(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item up', () => {
    expect(moveWithin(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op when the indexes match', () => {
    expect(moveWithin(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const ids = ['a', 'b', 'c'];
    moveWithin(ids, 0, 2);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('applyReorder', () => {
  const tasks = [
    task({ id: 'a', date: '2026-08-10', sortOrder: 0 }),
    task({ id: 'b', date: '2026-08-10', sortOrder: 1 }),
    task({ id: 'elsewhere', date: '2026-08-11', sortOrder: 7 }),
  ];

  it('renumbers the listed tasks to their index', () => {
    const out = applyReorder(tasks, '2026-08-10', ['b', 'a']);
    expect(out.find((t) => t.id === 'b')!.sortOrder).toBe(0);
    expect(out.find((t) => t.id === 'a')!.sortOrder).toBe(1);
  });

  it('re-dates a task dragged in from another column', () => {
    const out = applyReorder(tasks, '2026-08-10', ['a', 'elsewhere', 'b']);
    const moved = out.find((t) => t.id === 'elsewhere')!;
    expect(moved.date).toBe('2026-08-10');
    expect(moved.sortOrder).toBe(1);
  });

  it('moves a task to the Inbox when the target date is null', () => {
    const out = applyReorder(tasks, null, ['a']);
    expect(out.find((t) => t.id === 'a')!.date).toBeNull();
  });

  it('leaves unlisted tasks untouched', () => {
    const out = applyReorder(tasks, '2026-08-10', ['b', 'a']);
    expect(out.find((t) => t.id === 'elsewhere')).toEqual(tasks[2]);
  });
});
