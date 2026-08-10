# Numbered, drag-orderable tasks on the Week board

**Date:** 2026-08-10
**Status:** approved

## Problem

Tasks in a Week-board column appear in creation order and nothing can change it.
`Task.sortOrder` exists end to end but is only ever set to `Date.now()` at
creation, so it encodes "when I typed this", not "what I want to do first".
There is also no visual sense of sequence — a column of five tasks reads as a
set, not a plan.

## Goals

- Each undone task shows its position in its column: 1, 2, 3, …
- Dragging a task within a column moves it to that position, and the order sticks.
- Dragging a task to another column drops it at the aimed-at position, not
  always at the end.

## Non-goals

- Priority as a stored field. The number is the position, nothing more.
- Numbering or reordering in the archive view — archived tasks stay read-only.
- Cross-device realtime reconciliation of concurrent reorders. Last write wins.

## Design

### Ordering rules

Within a column, tasks sort by `done` (undone first) then `sortOrder`. That is
already what day columns do (`WeekBoard.tsx`); the Inbox gains the same sort.

Numbers are derived at render time, never stored: the *n*th undone task in a
column shows *n*. Done tasks sink to the bottom and show no number — their
checkbox already carries the state. Numbers therefore always run 1…n with no
gaps, and checking a task off renumbers the rest.

The Inbox is numbered and reorderable like any day column. The archive view is
not: no numbers, no drag.

### Persistence

No schema change. `sortOrder` is already `INTEGER NOT NULL DEFAULT 0` in
`db.ts`, mirrored in `schema.ts` and `types.ts`.

A reorder renumbers the whole affected column to a compact `0, 1, 2, …`
sequence. New tasks keep getting `Date.now()` — a far larger number — so they
continue to land at the bottom of a renumbered column without special-casing.

### Server

New endpoint:

```
POST /tasks/reorder   { date: string | null, ids: string[] }  ->  { ok: true }
```

`ids` is the complete ordered id list for one column. The handler, in a single
transaction, sets `date = date` and `sortOrder = index` for every id that
belongs to the calling user. Ids that don't exist or belong to another user are
silently skipped — a stale client must not be able to touch another user's rows,
and must not 500 on a task deleted in another tab.

It queues a gcal sync **only** for tasks whose `date` actually changed. This is
the reason for a bulk endpoint rather than N `PATCH /tasks/:id` calls: every
task PATCH fires `queueTaskSync`, so renumbering a five-task column would mean
five pointless Google Calendar writes for a change Calendar cannot even see.

Auth needs no new registration — `api.use('/tasks/*', requireAuth)` already
covers it.

### Client

- `npm install @dnd-kit/sortable` (with `@dnd-kit/utilities`). `@dnd-kit/core` is
  already a dependency; sortable is its standard companion and gives the live
  "cards shift out of the way" preview. Lockfile committed, per the project's
  `npm ci` rule.
- `DraggableTask` swaps `useDraggable` for `useSortable` and renders a number
  gutter: `w-3.5`, `text-[11px]`, `tabular-nums`, muted. Empty for done tasks.
- Each column's list is wrapped in a `SortableContext` with a vertical strategy.
- `onDragEnd` resolves the drop to a target column and index, computes the new
  id order with a pure helper, and calls `useReorderTasks`, which updates the
  `['tasks']` query cache optimistically before the request and rolls back on
  error.
- The `dragHappened` ref guard stays exactly as is — a drag must not toggle a
  checkbox, open the editor, or archive.

### Pure helpers (`client/src/lib/order.ts`)

Kept out of the component so they are testable without simulating a DOM drag.

- `columnOrder(tasks)` — sort by `done` then `sortOrder`.
- `moveWithin(ids, from, to)` — array move.
- `applyReorder(tasks, date, ids)` — the optimistic cache transform: assign
  `sortOrder = index` and the new `date` to the listed tasks.

## Testing

Server (`server/src/taskReorder.test.ts`):

- reorders a column and `GET /tasks` returns the new order
- a drag between columns sets both `date` and position in one call
- ids belonging to another user are ignored, leaving their rows untouched
- unknown ids are ignored rather than erroring
- rejects a malformed body with 400

Client (`client/src/lib/order.test.ts`):

- `columnOrder` puts undone before done and respects `sortOrder`
- `moveWithin` moves up and down, including to the ends
- `applyReorder` renumbers and re-dates only the listed tasks
- numbering skips done tasks and stays gapless

## Risks

The PWA service worker caches `/api` responses NetworkFirst, so a stale `/tasks`
payload can be rendered. `sortOrder` has always been present and non-null, so
there is no missing-field hazard here of the kind `isArchived` had to handle.
