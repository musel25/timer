# ⏱ timer.musel.dev

A minimalist, powerful, customizable **interval timer + habit tracker** for the web — a clone of the
Android *Interval Timer* app, plus daily habits and progress tracking. Installable as a PWA, works
with a cached app shell and queued run logs. Account data syncs across devices behind a private login.

## Features

- **Desktops board** — one card per Ubuntu virtual workspace, numbered in swipe order (archiving
  one collapses the numbering, exactly like GNOME dynamic workspaces). Each card holds a
  description, a task checklist with progress, and a timestamped journal; clicking a card pins it
  full-width as the focused stage where everything edits in place.
- **Timers** — build and run a *Focus block* (multi-round work/break Pomodoro) or a plain
  countdown *Timer*, with prep countdown, chimes, and reusable saved presets. The Timer page
  sums completed study sets and work time by day. Breaks do not add to study time. Old timer
  records remain in history but lack a reliable work/break split, so the study record starts
  with newly tracked runs. Set each focus block in minutes and seconds. For 30 seconds, use
  0 minutes and 30 seconds.
  Saved timers keep their duration when reopened.
- **One shared timer with habit tagging** — there's always at most one running timer. It keeps
  going as you navigate between pages. Start a Focus block, then on the **Habits** page tap a
  habit to count that block toward it (tap another to switch the tag). No nested second timer.
- **Navigation** — a slim left bar: **Week · Habits · Desktops · Timer · Progress · Notes · Settings**. The
  Week planner is the home view. It shows per-day tasks and Google Calendar events, with today
  highlighted.
- **Habit dashboard** — your daily habits grouped by time of day, each with duration presets.
  Tap a duration to start; click a habit to open its **drill-down** (Overview + Month).
- **Three habit layers — daily · weekly · monthly** — kept visually separate, because they answer
  different questions. **Daily** is today's list, grouped by time of day. **This week** and **This
  month** are agendas: one row per habit ordered by the day it comes round, with that day named
  (`Sat · Courage`, `28th · Life review`) and today's row highlighted, so there is never any doubt
  about when a habit is meant to happen. The anchor day is **soft** — it decides when a habit
  surfaces and nudges, while logging it any time in the period counts, so a Saturday habit done on
  Wednesday still satisfies the week.
- **Structured entries** — a habit can open a real form instead of a note: the journal's theme
  rotates by weekday (self-awareness, beliefs, character, gratitude, problems, curiosity), courage
  records *anticipated vs actual* discomfort 1–5, and the monthly life review rates nine areas 0–10.
  Those numbers become charts in the drill-down — the gap between anticipated and actual is the
  whole point.
- **Per-habit drill-down** — an Overview (streak, activity grid, recent days vs. goal) and a
  **Month** calendar where you paint **vacation** (lighter goal) and **rest** (streak-skip) days
  as ranges — tap a start day then an end day. (Vacation/rest dates are global across habits.)
- **Progress tracking** — every run logs a session, powering streaks, a GitHub-style minutes
  heatmap, weekly/monthly totals, and per-habit goals (lighter on weekends/vacation). New timer
  sessions count completed work time in these totals, even when the whole run stops early.
- **Audio & voice** — countdown beeps, distinct work/rest/finish tones (Web Audio, no asset files),
  optional spoken cues.
- **PWA** — installable, with a cached app shell and offline run logging. Private account data
  requires a connection. **Wake Lock** keeps the screen on during a workout.
- **Accounts** — single private account (closed signup), cross-device cloud sync, JSON export/import.
- **Google Calendar** — events show up in the Week planner; dated tasks mirror to a dedicated
  Planner calendar (service-account setup: see [docs/gcal-setup.md](docs/gcal-setup.md)).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS, React Router, TanStack Query, vite-plugin-pwa |
| Backend | Node 22 + Hono (serves the SPA + `/api`), zod validation |
| Database | SQLite via Drizzle ORM + better-sqlite3 |
| Auth | scrypt password hashing (`node:crypto`), server-side sessions, httpOnly cookies |
| Deploy | Docker + nginx + certbot on the Oracle Cloud VPS (`timer.musel.dev`) |

## Local development

Use Node 22 (`nvm use` if you use nvm). All package lockfiles are committed.

```bash
npm run install:all          # install client + server deps
cp .env.example server/.env  # set ADMIN_EMAIL and ADMIN_PASSWORD
npm run dev                  # server on :8080, client (Vite) on :5173 with /api proxy
```

Open http://localhost:5173 and log in with the admin credentials from `server/.env`.

## Build & test

```bash
npm run verify  # types + tests + deployment regressions + production build
npm test        # server + client tests
npm run build   # server bundle + client static files
```

## Deployment

Use `./deploy.sh` from a clean, pushed checkout. The script verifies the code, deploys the exact
commit, and checks that production serves that revision. It restores the previous image if startup,
health, or edge verification fails. See [DEPLOY.md](DEPLOY.md).

Project rules for coding agents are in [AGENTS.md](AGENTS.md). GitHub Actions runs the verification
command and tests the actual production image.

## Project layout

```
client/   React + Vite SPA (timer engine, dashboard, stats, settings)
server/   Hono API + Drizzle/SQLite + auth + seeding
deploy/   nginx vhost
Dockerfile, compose.yaml, DEPLOY.md
```

### Grind Recall accounts

Grind's separate frontend at `/grind/` uses `/api/grind/` for login, registration,
account identity and per-user progress snapshots. Existing Planner sessions work.
`grind_states` stores one JSON snapshot per user in the persistent SQLite volume;
version checks reject stale writes and mutation IDs make retries idempotent.
The Planner service worker excludes these API responses from caching. The
frontend also uses unique request URLs to protect clients still on an older worker.

Deploy this repository with `./deploy.sh` before deploying the `grind-recall`
frontend. The migration only adds a table; it does not change Planner data or
import browser progress. Each user explicitly chooses whether to import their
original Grind browser data. Test the API with `cd server && npm test`.
