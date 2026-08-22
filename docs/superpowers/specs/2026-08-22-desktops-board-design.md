# Desktops board — one card per Ubuntu workspace

**Status:** design approved 2026-08-22 (layouts chosen visually: Exposé grid; opened card pins full-width)
**Supersedes:** the Now board (`2026-08-22-now-board-in-flight-threads-design.md`) — replaced, not extended.

## Problem

The user organizes work spatially: each Ubuntu virtual desktop holds one project,
switched with a three-finger swipe. The dashboard should mirror that arrangement —
one card per workspace, in the same order, numbered 1..N — so the app answers
"what is on desktop 2" the way the OS does. Layout quality is the explicit top
requirement: organizational, functional, pretty.

The Now board (threads, park/wait/ready, WIP cap, nudges) did not stick; the user
chose a clean slate: cards are pure organization with no state machine.

## The unit: a desktop

| Field | Meaning |
|---|---|
| `title` | what this workspace is |
| `lane` | free-text project tag; colors the chip via the existing `categoryColor` hash |
| `description` | editable paragraph describing the desktop |
| `tasks` | JSON checklist `[{id, text, done}]`; card shows a done/total progress bar |
| `comments` | JSON append-only log `[{id, text, at}]` — a per-desktop journal, newest first |
| `focused` | at most one per user, server-enforced (PATCH focused:true demotes the rest) |
| `sortOrder` | ordering integer; the displayed number is index+1 in sorted order, so removal collapses numbering like GNOME dynamic workspaces — no renumbering code |
| `archivedAt` | "Done" archives (journal survives); archived rows hidden from GET |

Tasks/comments are JSON columns (the `notes.tags` pattern), not separate tables:
one PATCH updates a card, single-user SQLite needs no joins.

## The page (`/desktops`, the home route)

- **Exposé grid** of uniform cards: large monospace number badge, title, lane chip,
  thin progress bar, up to 3 unchecked tasks, latest comment. A dashed
  "+ desktop N+1" capture card is always last.
- **Click a card → it pins full-width at the top of the page**; the grid packs
  beneath it. The pinned card = the `focused` desktop (persisted, survives reload).
  Esc or its collapse control unpins (focused:false).
- **Pinned card contents:** editable title row, click-to-edit description, two
  columns — TASKS (check/uncheck, add, delete) and LOG (append note, timestamps,
  newest first) — plus Done (archive) and Delete actions.
- No modals, no per-desktop routes; everything edits in place.
- Visual: focused ring in the accent color + shadow lift; lane chips tinted by
  `categoryColor(lane)`; grid reflow animated with CSS transitions. Dark theme
  first, matching the app.

## Removals (the clean-slate cost)

- Client: the whole `features/now/` directory (board, cards, strip, provider,
  nextUp, notify + tests); NowProvider/route from `App.tsx`; NowStrip, Now tab and
  ready badge from `Layout.tsx`; the "Now board" Settings section.
- Settings keys `wipLimit`, `nowNudges` dropped from `DEFAULT_SETTINGS` and the
  `Settings` type (stale cached settings objects carrying them are harmless).
- Server: `/threads` routes, zod input, demote helper, export/import entries, and
  the `threads` CREATE TABLE (existing DBs keep the orphaned table — no
  destructive migration; fresh DBs never create it). `threads.test.ts` deleted.
- `client/src/lib/docTitle.ts` **stays** (the agents dashboard still badges the
  tab); its 'now' contributor goes away with NowContext.
- Navigation: the slot-1 tab becomes **Desktops** (Monitor icon), home route `/`
  → `/desktops`; `/now` redirects to `/desktops`. Global 1-9 nav shortcuts keep
  working; the board itself binds only Esc, so nothing collides.

## Server slice

Same pattern as every other resource: raw CREATE TABLE in `db.ts` +
drizzle table in `schema.ts` + `Desktop` type in `client/src/lib/types.ts`;
zod-validated CRUD in `api.ts` under `/api/desktops` with `requireAuth`
registered for the prefix; export/import gains `desktops`.

- `GET /desktops` — non-archived, ordered `sortOrder asc`
- `POST /desktops` — title required; sortOrder defaults to now (appends)
- `PATCH /desktops/:id` — partial; `focused: true` demotes any other focused row
- `DELETE /desktops/:id` — hard delete (the UI's Done uses PATCH archivedAt)

## Testing

- `server/src/desktops.test.ts`: table columns, migrate idempotent, 401 unauth,
  defaults on POST, single-focus demote, per-user scoping, archived hidden from
  GET, delete, export/import round-trip.
- `client/src/features/desktops/cardOps.test.ts`: pure task/comment array ops
  (toggle, add, remove, append-comment) and the number-from-index rule.
- `Layout.test.tsx` updated for the renamed tab (same indices).
- Hands-on Playwright pass against an isolated server before deploy.

## Out of scope

Reading the actual GNOME workspace state (which desktop is OS-focused), drag
reordering (collapse-only, per user's choice), phone push.
