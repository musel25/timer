# Now board — in-flight threads

**Status:** design approved 2026-08-22
**Problem owner:** single-user app (musel), ADHD working style

## Problem

Work happens as 2–3 *simultaneous in-flight threads*, not as one task at a time.
A typical minute: an AI agent is generating, so the paper gets read, so the code
gets a small edit — three balls in the air, two of them blocked on something that
isn't the user.

Four distinct failures were named, all four of which occur:

1. **The parked thing dies.** The agent finished 20 minutes ago and was never
   returned to.
2. **Blank at the switch point.** One thread ends, and nothing obvious is next,
   so attention drifts somewhere unrelated.
3. **Lost context on return.** Coming back to a thread, the next move is gone.
4. **Can't see the whole set.** Three threads don't fit in working memory, so the
   state of play feels like chaos rather than a list.

Nothing in the app models this. A `Task` is a checkbox scoped to a day; the timer
engine assumes exactly one thing is happening; `Note` is undirected capture.

## Non-goals

- Not a replacement for the Week board. Week plans *days*; this tracks *minutes*.
- No phone push / Web Push infrastructure. Nudges reach the user through the open
  tab and desktop notifications only — that was the explicit constraint.
- No automatic detection of external state (agent finished, build done). Wake-ups
  are user-set timers.
- No timer-engine integration in v1 (see Follow-ups).

## The unit: a thread

A **thread** is one ball in the air. It is deliberately not a task: it is created
in a second, lives for tens of minutes, and is usually not something that was
ever written down in advance.

| Field | Meaning |
|---|---|
| `title` | what it is |
| `lane` | optional free-text project ("thesis", "timer"), typed inline as `#lane` |
| `state` | `active` \| `waiting` \| `parked` |
| `nextStep` | one line: where you were / what the next move is |
| `wakeAt` | epoch ms; when a `waiting` thread should poke you. Null = no timer |
| `waitingOn` | short label: "claude", "build", "Ana" |
| `taskId` | optional link to an existing Week task |
| `doneAt` | when it left the board; null while in flight |
| `touchedAt` | last state change or edit |

**Invariants**

- At most one `active` thread per user, enforced server-side: a PATCH that sets
  `state: 'active'` demotes any other active thread to `parked` in the same
  transaction. Two tabs therefore cannot disagree about what is active.
- A **WIP cap** (`settings.wipLimit`, default 3) bounds threads with
  `doneAt IS NULL`. Enforced in the client only — it is a self-discipline device,
  not a security boundary, and a server-side cap would make `/import` of a larger
  historical set fail for no benefit.

The cap is the load-bearing ADHD mechanic. Without it the board becomes another
unbounded list, which is the thing being avoided. Hitting the cap disables "add"
and says which thread to finish or drop first.

## How each failure is answered

| Failure | Mechanic |
|---|---|
| Parked thing dies | `waiting` + `wakeAt` → tab title, sidebar badge, desktop notification when due |
| Blank at switch point | A single **Next up** card chosen by a fixed rule — nothing to decide |
| Lost context on return | `nextStep`, captured at park time, shown on the card |
| Can't see the whole set | The `/now` board plus an ambient strip on every page |

### The Next-up rule

A pure function in `client/src/features/now/nextUp.ts`, unit-tested:

1. Any `waiting` thread whose `wakeAt` has passed → the one overdue longest.
2. Else, if no thread is `active` → the `parked` thread with the oldest
   `touchedAt`.
3. Else → no card; the board shows "You're on: *title*".

It is deterministic on purpose. The value is the absence of a choice.

## Surfaces

**1. `/now` page** — becomes the home route (`/` redirects to `/now`; `/week`
stays exactly where it is). Layout, top to bottom:

- The **active** card, large — title, lane chip, next-step line, and
  `Park` / `Wait on…` / `Done` actions. If nothing is active, the **Next up**
  card takes this slot with a single `Pick this up` button.
- The remaining threads as compact rows, `waiting` before `parked`. A waiting row
  shows a live countdown, or a `ready` pill once `wakeAt` has passed.
- `+ Add thread` — a single text input, Enter to commit. Disabled at the cap with
  the reason shown.

**2. Ambient strip** — rendered by `Layout` above `<Outlet />`, so it is present
on every page. Reads `● <active title> · 2 waiting · 1 ready`, clicks through to
`/now`. Hidden entirely when no threads are in flight, so it costs nothing on a
single-tasking day. It sits at the top of the main column because `MiniPlayer`
already owns the bottom.

**3. Sidebar** — a `Now` item at the top of the `Plan` group, badged with the
ready count. This reuses the badge treatment already built for the Agents tab.
Note the knock-on: `shortcutTabs` is the flattened nav order, so the 1–9 jump
keys shift by one — `Now` becomes 1 and `Week` becomes 2. That is intended (Now
is the new home), and `Layout.test.tsx` will need updating with it.

**4. Tab title** — with one or more ready threads, `document.title` becomes
`(1) ready · Timer`, restored when the count returns to zero.

**5. Desktop notification** — see below.

## Nudges

A `NowProvider` (sibling in style to `RunContext` and `AgentsContext`) holds the
thread list, a 5-second tick, and the notifier. Rules:

- A check every 15s finds threads that crossed `wakeAt` since the previous check.
- Permission is requested **the first time a wake-at is set**, never on page load.
  A permission prompt on load is denied reflexively and is then unrecoverable.
- Notifications fire through the existing service-worker registration
  (`registration.showNotification`) so an installed PWA behaves the same, with a
  plain `new Notification(...)` fallback.
- Fired ids are kept in `localStorage` so a reload does not re-fire.
- **Stale guard:** a thread is only notified if `wakeAt` is within the last 10
  minutes. The service worker caches `/api` NetworkFirst, so a resumed session can
  hand the client hours-old rows; without this guard it would fire a burst of
  irrelevant notifications on wake.
- `settings.nowNudges` (default `true`) mutes notifications while leaving the
  visual surfaces alone.

## Data & API

Following the `notes` slice exactly.

`server/src/db.ts` — raw `CREATE TABLE IF NOT EXISTS threads` with
`idx_threads_user_touched (user_id, touched_at)`. No `addColumnIfMissing` needed:
the table is new, and `CREATE TABLE IF NOT EXISTS` covers the existing prod DB.

`server/src/schema.ts` — matching drizzle table.
`client/src/lib/types.ts` — matching `Thread` interface and `ThreadState` union.

`server/src/api.ts`:

```
api.use('/threads', requireAuth); api.use('/threads/*', requireAuth);

GET    /threads          doneAt IS NULL, or doneAt within the last 24h;
                         ordered in-flight first, then most recently done
POST   /threads          {title, lane?, state?, nextStep?, wakeAt?, waitingOn?, taskId?}
PATCH  /threads/:id      partial; setting state:'active' demotes the previous active
DELETE /threads/:id
```

Auth is opt-in per prefix in this codebase — an unregistered `/threads` prefix
would be **public**. The `api.use` lines are part of the feature, not a detail.

`/export` and `/import` both gain `threads`, alongside the existing tables.

Client hooks in `client/src/lib/hooks.ts`: `useThreads`, `useSaveThread`,
`useDeleteThread` — the `useNotes` shape.

## Settings

Two additions to `Settings` and `DEFAULT_SETTINGS`:

- `wipLimit: number` — default `3`.
- `nowNudges: boolean` — default `true`.

Both surface in the Settings page. `wipLimit` is exposed because 3 is a guess;
living with it is the only way to find out whether the real number is 2 or 5.

Stale-cache rule from CLAUDE.md applies: a cached `/api/settings` predating this
change has neither field, so both must read through a default rather than being
assumed present.

## Files

New:
- `client/src/features/now/NowBoard.tsx` — the page
- `client/src/features/now/NowContext.tsx` — provider: list, tick, notifier
- `client/src/features/now/ThreadCard.tsx`, `ThreadRow.tsx`, `AddThread.tsx`
- `client/src/features/now/NowStrip.tsx` — the ambient bar
- `client/src/features/now/nextUp.ts` + `nextUp.test.ts`
- `client/src/features/now/notify.ts` + `notify.test.ts`
- `server/src/threads.test.ts`

Changed:
- `server/src/db.ts`, `server/src/schema.ts`, `server/src/api.ts`
- `client/src/lib/types.ts`, `client/src/lib/hooks.ts`
- `client/src/App.tsx` (route + provider), `client/src/features/Layout.tsx`
  (nav item, badge, strip), `client/src/features/settings/` (two controls)

## Testing

- `server/src/threads.test.ts` — CRUD; the single-active invariant demotes the
  previous active thread; rows are scoped to their user; `/export` round-trips
  through `/import`.
- `nextUp.test.ts` — each branch of the rule, plus the empty board.
- `notify.test.ts` — a due thread fires once and only once across a reload; a
  thread whose `wakeAt` is hours old does not fire; muting suppresses firing.
- The WIP-cap arithmetic counts only `doneAt === null`.

## Follow-ups (explicitly out of v1)

- Starting a timer labelled with the active thread when you pick it up. The app is
  a timer app and this is a natural seam, but it couples two subsystems before
  either has been lived with.
- Feeding real Claude Code session state (the dev-only `/agents` dashboard already
  models "waiting on you") into threads automatically, removing the manual wake-at.
- Unrelated pre-existing gap, noted not fixed: `/export` and `/import` omit
  `rest_days` and `vacation_days`, so a restore silently degrades habit streaks.
