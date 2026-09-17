import type { DesktopTask } from '../../lib/types';

/** Pure array ops for a desktop's tasks. Each returns a new array; the caller
 *  PATCHes the whole column (single-user, no merge needed).
 *
 *  The list is flat on purpose: a desktop holds one day of work, and a day's
 *  worth of work fits on one line per item. Rows written before the redesign
 *  may still carry a `subtasks` field — nothing here reads it, and nothing here
 *  strips it either, so the old text survives in the database untouched. */

const mapTask = (tasks: DesktopTask[], id: string, fn: (t: DesktopTask) => DesktopTask): DesktopTask[] =>
  tasks.map((t) => (t.id === id ? fn(t) : t));

export const toggleTask = (tasks: DesktopTask[], id: string): DesktopTask[] =>
  mapTask(tasks, id, (t) => ({ ...t, done: !t.done }));

export const addTask = (tasks: DesktopTask[], text: string): DesktopTask[] =>
  [...tasks, { id: crypto.randomUUID(), text, done: false }];

export const removeTask = (tasks: DesktopTask[], id: string): DesktopTask[] =>
  tasks.filter((t) => t.id !== id);

export const renameTask = (tasks: DesktopTask[], id: string, text: string): DesktopTask[] =>
  mapTask(tasks, id, (t) => ({ ...t, text }));

export const taskProgress = (tasks: DesktopTask[]): { done: number; total: number } =>
  ({ done: tasks.filter((t) => t.done).length, total: tasks.length });
