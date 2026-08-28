# ⏱ timer.musel.dev

A minimalist, powerful, customizable **interval timer + habit tracker** for the web — a clone of the
Android *Interval Timer* app, plus daily habits and progress tracking. Installable as a PWA, works
offline, syncs across devices behind a private login.

## Features

- **Desktops board** — one card per Ubuntu virtual workspace, numbered in swipe order (archiving
  one collapses the numbering, exactly like GNOME dynamic workspaces). Each card holds a
  description, a task checklist with progress, and a timestamped journal; clicking a card pins it
  full-width as the focused stage where everything edits in place.
- **Timers** — build and run a *Focus block* (multi-round work/break Pomodoro) or a plain
  countdown *Timer*, with prep countdown, chimes, and reusable saved presets.
- **One shared timer with habit tagging** — there's always at most one running timer. It keeps
  going as you navigate between pages. Start a Focus block, then on the **Habits** page tap a
  habit to count that block toward it (tap another to switch the tag). No nested second timer.
- **Navigation** — a slim left bar: **Desktops · Week · Habits · Timer · Progress · Settings**. The
  Desktops board is the home view; the Week planner (per-day tasks + Google Calendar events, today
  highlighted) is one key away.
- **Habit dashboard** — your daily habits grouped by time of day, each with duration presets.
  Tap a duration to start; click a habit to open its **drill-down** (Overview + Month).
- **Three habit layers — daily · weekly · monthly** — a habit's *cadence* decides what its streak
  counts. Weekly and monthly habits carry a **soft anchor day**: they surface in Today on that day
  (Nature on Saturday, the life review on the 28th) but count anywhere in the period, so a walk
  taken on Wednesday still satisfies the week. A pill strip per layer keeps the whole week and
  month visible and loggable without adding a dozen standing rows.
- **Structured entries** — a habit can open a real form instead of a note: the journal's theme
  rotates by weekday (self-awareness, beliefs, character, gratitude, problems, curiosity), courage
  records *anticipated vs actual* discomfort 1–5, and the monthly life review rates nine areas 0–10.
  Those numbers become charts in the drill-down — the gap between anticipated and actual is the
  whole point.
- **Per-habit drill-down** — an Overview (streak, activity grid, recent days vs. goal) and a
  **Month** calendar where you paint **vacation** (lighter goal) and **rest** (streak-skip) days
  as ranges — tap a start day then an end day. (Vacation/rest dates are global across habits.)
- **Progress tracking** — every run logs a session, powering streaks, a GitHub-style minutes
  heatmap, weekly/monthly totals, and per-habit goals (lighter on weekends/vacation).
- **Audio & voice** — countdown beeps, distinct work/rest/finish tones (Web Audio, no asset files),
  optional spoken cues.
- **PWA** — installable, offline-capable, **Wake Lock** keeps the screen on during a workout.
- **Accounts** — single private account (closed signup), cross-device cloud sync, JSON export/import.
- **Google Calendar** — events show up in the Week planner; dated tasks mirror to a dedicated
  Planner calendar (service-account setup: see [docs/gcal-setup.md](docs/gcal-setup.md)).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS, React Router, TanStack Query, vite-plugin-pwa |
| Backend | Node 24 + Hono (serves the SPA + `/api`), zod validation |
| Database | SQLite via Drizzle ORM + better-sqlite3 |
| Auth | scrypt password hashing (`node:crypto`), server-side sessions, httpOnly cookies |
| Deploy | Docker + nginx + certbot on the Oracle Cloud VPS (`timer.musel.dev`) |

## Local development

```bash
npm run install:all          # install client + server deps
cp .env.example server/.env  # set SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev                  # server on :8080, client (Vite) on :5173 with /api proxy
```

Open http://localhost:5173 and log in with the admin credentials from `server/.env`.

## Build & test

```bash
npm run build   # builds server bundle + client static files
npm test        # server + client unit tests
```

## Deployment

See [DEPLOY.md](DEPLOY.md). In short: it runs in Docker behind nginx with a Let's Encrypt cert, the
same pattern as `math.musel.dev`. Updates are `git pull && docker compose up -d --build`.

## Project layout

```
client/   React + Vite SPA (timer engine, dashboard, stats, settings)
server/   Hono API + Drizzle/SQLite + auth + seeding
deploy/   nginx vhost
Dockerfile, compose.yaml, DEPLOY.md
```
