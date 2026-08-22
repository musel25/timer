import type { DesktopComment, DesktopTask } from '../../lib/types';

/** Pure array ops for a card's embedded tasks/comments. Each returns a new
 *  array; the caller PATCHes the whole column (single-user, no merge needed). */

export const toggleTask = (tasks: DesktopTask[], id: string): DesktopTask[] =>
  tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));

export const addTask = (tasks: DesktopTask[], text: string): DesktopTask[] =>
  [...tasks, { id: crypto.randomUUID(), text, done: false }];

export const removeTask = (tasks: DesktopTask[], id: string): DesktopTask[] =>
  tasks.filter((t) => t.id !== id);

/** Prepend — the log reads newest first. */
export const addComment = (comments: DesktopComment[], text: string, at: number): DesktopComment[] =>
  [{ id: crypto.randomUUID(), text, at }, ...comments];

export const taskProgress = (tasks: DesktopTask[]): { done: number; total: number } =>
  ({ done: tasks.filter((t) => t.done).length, total: tasks.length });
