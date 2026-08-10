import type { Task } from './types';

/** Reading order for one board column: what's left first, in the order you
 *  dragged it, with finished tasks sunk to the bottom. */
export function columnOrder(tasks: Task[]): Task[] {
  return tasks.slice().sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder);
}

/** The 1-based position shown on a card, or null for a done task — its
 *  checkbox already says everything. Counting only undone tasks keeps the
 *  numbers gapless as things get ticked off. */
export function numberOf(ordered: Task[], task: Task): number | null {
  if (task.done) return null;
  let n = 0;
  for (const t of ordered) {
    if (t.done) continue;
    n += 1;
    if (t.id === task.id) return n;
  }
  return null;
}

/** Array move, non-mutating. */
export function moveWithin<T>(items: T[], from: number, to: number): T[] {
  const out = items.slice();
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/** The optimistic half of a reorder: give every listed task its new column and
 *  position, leave everything else alone. Mirrors POST /tasks/reorder. */
export function applyReorder(tasks: Task[], date: string | null, ids: string[]): Task[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return tasks.map((t) => {
    const i = pos.get(t.id);
    return i === undefined ? t : { ...t, date, sortOrder: i };
  });
}
