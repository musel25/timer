import type { DesktopSubtask, DesktopTask } from '../../lib/types';

/** Pure array ops for a card's embedded tasks. Each returns a new array; the
 *  caller PATCHes the whole column (single-user, no merge needed).
 *
 *  Subtasks go one level deep and are read through {@link subtasksOf}, because a
 *  row cached before the field existed carries no list at all. */

/** A task's subtasks, treating a missing list as an empty one. */
export const subtasksOf = (task: DesktopTask): DesktopSubtask[] => task.subtasks ?? [];

const mapTask = (tasks: DesktopTask[], id: string, fn: (t: DesktopTask) => DesktopTask): DesktopTask[] =>
  tasks.map((t) => (t.id === id ? fn(t) : t));

const mapSubtasks = (
  tasks: DesktopTask[], taskId: string, fn: (subs: DesktopSubtask[]) => DesktopSubtask[],
): DesktopTask[] => mapTask(tasks, taskId, (t) => ({ ...t, subtasks: fn(subtasksOf(t)) }));

export const toggleTask = (tasks: DesktopTask[], id: string): DesktopTask[] =>
  mapTask(tasks, id, (t) => ({ ...t, done: !t.done }));

export const addTask = (tasks: DesktopTask[], text: string): DesktopTask[] =>
  [...tasks, { id: crypto.randomUUID(), text, done: false, subtasks: [] }];

export const removeTask = (tasks: DesktopTask[], id: string): DesktopTask[] =>
  tasks.filter((t) => t.id !== id);

export const renameTask = (tasks: DesktopTask[], id: string, text: string): DesktopTask[] =>
  mapTask(tasks, id, (t) => ({ ...t, text }));

export const addSubtask = (tasks: DesktopTask[], taskId: string, text: string): DesktopTask[] =>
  mapSubtasks(tasks, taskId, (subs) => [...subs, { id: crypto.randomUUID(), text, done: false }]);

export const toggleSubtask = (tasks: DesktopTask[], taskId: string, subId: string): DesktopTask[] =>
  mapSubtasks(tasks, taskId, (subs) => subs.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)));

export const renameSubtask = (
  tasks: DesktopTask[], taskId: string, subId: string, text: string,
): DesktopTask[] =>
  mapSubtasks(tasks, taskId, (subs) => subs.map((s) => (s.id === subId ? { ...s, text } : s)));

export const removeSubtask = (tasks: DesktopTask[], taskId: string, subId: string): DesktopTask[] =>
  mapSubtasks(tasks, taskId, (subs) => subs.filter((s) => s.id !== subId));

/** Card progress counts top-level tasks only: a subtask is how a task breaks
 *  down, not another unit of work to get through. */
export const taskProgress = (tasks: DesktopTask[]): { done: number; total: number } =>
  ({ done: tasks.filter((t) => t.done).length, total: tasks.length });

export const subtaskProgress = (task: DesktopTask): { done: number; total: number } => {
  const subs = subtasksOf(task);
  return { done: subs.filter((s) => s.done).length, total: subs.length };
};
