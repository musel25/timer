# Weekday-only streaks + Google Calendar integration — design

Date: 2026-06-12
Status: approved

Two features, built in order: (1) weekday-only streaks for Work habits, (2) two-way
Google Calendar integration via a service account.

## Feature 1: Weekday-only streaks

### Problem

Work habits (Math Training, Anki, Prog. Read, LeetCode review) are only done
Monday–Friday. The current streak math walks back day-by-day, so every weekend
resets those streaks to at most 5.

### Data model

- New column on `habit_groups`: `weekdays_only INTEGER NOT NULL DEFAULT 0`.
- Added in `server/src/db.ts` via the existing `addColumnIfMissing` helper.
- One-time backfill, executed only when the column is first added: set
  `weekdays_only = 1` for groups named `Work`. (Picks up the production DB with
  no manual step; never re-applies, so turning the toggle off later sticks.)
- `server/src/seed.ts` sets `weekdaysOnly: true` for the seeded Work group.
- The `habit-groups` zod schema and PATCH endpoint accept the new field.

### Streak semantics

"Skip weekends entirely": for a habit in a `weekdays_only` group, Saturdays and
Sundays are invisible to the streak — they never break it and never add to it,
even if a session was logged then. The streak counts consecutive weekdays met.

- `goalStreak(sessions, habitId, dailyGoalMin, weekdaysOnly?)` in
  `client/src/lib/stats.ts`: when `weekdaysOnly` is set, the walk-back cursor
  skips Sat/Sun without requiring them, and the initial grace day (today not yet
  met → check yesterday) also skips weekends, so on Monday the streak survives
  if Friday was met.
- The global `currentStreak` on the Today page is unchanged — Morning/Night
  habits still run on weekends, so all 7 days count there.

### UI

- "Weekdays only (Mon–Fri)" toggle in the habit-group editing UI.
- The Progress page looks up each habit's group and passes the flag into
  `goalStreak`.

### Tests (`client/src/lib/stats.test.ts`)

- Friday met + nothing on Sat/Sun + Monday met → streak bridges the weekend.
- Session logged on Saturday → neither extends nor is required.
- Missed Wednesday still breaks the streak.
- `weekdaysOnly` false → behavior identical to today.

## Feature 2: Google Calendar integration (service account, both directions)

### Approach

A Google Cloud **service account** is used instead of OAuth: no consent screen,
no refresh-token flow. The user shares calendars with the service account's
email like sharing with a person. One mechanism gives near-real-time reads and
writes.

One-time user setup (documented in `docs/gcal-setup.md`):

1. Create a Google Cloud project, enable the Google Calendar API.
2. Create a service account, download its JSON key.
3. Share the primary calendar with the service-account email (read access:
   "See all event details").
4. Create a dedicated **"Planner"** calendar and share it with the service
   account with "Make changes to events".
5. Paste the JSON key and both calendar IDs into the app's Settings →
   Integrations section.

### Secrets storage

- New table `integrations`:
  `(user_id TEXT, kind TEXT, config TEXT/json, PRIMARY KEY (user_id, kind))`.
- NOT stored in `user_settings` — that JSON blob is returned to the client
  wholesale, and the private key must never leave the server.
- API responses about the integration return only metadata: service-account
  `client_email`, configured calendar IDs, last sync status. Never the key.

### Server: Google client

- `server/src/gcal.ts` using `google-auth-library` (JWT) + the Calendar v3 REST
  API via `fetch`. No `googleapis` mega-package.
- Scope: `https://www.googleapis.com/auth/calendar`.

### Read side (events into the planner)

- `GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD` (auth required).
- Server fetches events from the configured read calendar(s), normalized to
  `{ id, calendarId, title, start, end, allDay }`, with a ~5-minute in-memory
  cache keyed by range to keep the Week board snappy and quota-friendly.
- Client (TanStack Query):
  - **Week board**: events pinned at the top of each day column, visually
    distinct (calendar icon / muted chip style), not draggable, not tasks.
  - **Today view**: today's events listed above the task list, timed events
    showing their time.
- Offline / no integration configured: the events query fails or returns
  empty; views render exactly as today. Calendar is additive only.

### Push side (tasks out to the Planner calendar)

- Every task with a `date` mirrors to the Planner calendar as an **all-day
  event**.
- New column on `tasks`: `gcal_event_id TEXT` (via `addColumnIfMissing`).
- Lifecycle mapping:
  - create dated task → insert event, store `gcal_event_id`
  - retitle / move date → patch event
  - mark done → patch title to `✓ <title>`; undone removes the prefix
  - delete task, or un-date it (back to Inbox) → delete event, clear id
- Sync is **best-effort and async**: task CRUD endpoints respond immediately;
  the calendar write runs in the background (fire-and-forget promise with
  error logging). A Google failure can never block or fail a task operation.
- **Reconcile sweep** on server boot and hourly (`setInterval`): lists events
  on the Planner calendar, diffs against dated tasks, and creates/patches/
  deletes to converge. This repairs anything missed while the server was down
  or Google was unreachable. The Planner calendar is treated as app-owned:
  events there that no task references are deleted.

### Settings UI

Settings → new "Integrations" card:

- Textarea to paste the service-account JSON key (write-only; once saved the UI
  shows only the derived `client_email`).
- Inputs: read calendar ID(s), Planner (push) calendar ID.
- "Test connection" button → server attempts a metadata fetch on each
  configured calendar and reports per-calendar success/failure.

### Error handling

- Misconfigured/revoked key: events endpoint returns a typed error; the client
  shows a quiet "calendar unavailable" hint, never a broken board.
- Push failures: logged, repaired by the next reconcile sweep.

### Tests

- Server: unit tests for the task→event mapping (title prefix, all-day date
  math, lifecycle transitions) and the reconcile diff, with the Google client
  mocked. Secret-redaction test: integration GET never contains `private_key`.
- Client: events render in Week/Today from a mocked query.

### Build order

1. Weekday-only streaks (own commit/PR — small).
2. Calendar read side (integration storage + settings UI + events in views).
3. Calendar push side (event mirroring + reconcile sweep).
