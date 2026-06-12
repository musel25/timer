# ⏱ timer.musel.dev

A minimalist, powerful, customizable **interval timer + habit tracker** for the web — a clone of the
Android *Interval Timer* app, plus daily habits and progress tracking. Installable as a PWA, works
offline, syncs across devices behind a private login.

## Features

- **Two kinds of timers**
  - *Simple focus block* — one stretch of N minutes (with prep countdown + finish chime).
  - *Interval* — prep → sets × (work / rest), with per-interval labels, colors and sounds.
- **Quick Timer** — fire a one-off countdown or interval in seconds; optionally save it.
- **Saved timers** — a library of reusable presets, keyed by *duration / structure* (not by habit).
- **Habit dashboard** — your daily habits grouped by time of day (Morning / Work / Night), each with
  a row of duration presets. Tap a duration to start. Mirrors the layout you sketched.
- **Progress tracking** — every run logs a session (duration snapshotted), powering streaks, a
  GitHub-style minutes heatmap, weekly/monthly totals, and per-habit goals.
- **Audio & voice** — countdown beeps, distinct work/rest/finish tones (Web Audio, no asset files),
  optional spoken cues.
- **PWA** — installable, offline-capable, **Wake Lock** keeps the screen on during a workout.
- **Accounts** — single private account (closed signup), cross-device cloud sync, JSON export/import.
- **Google Calendar** — events show up in the Week planner and Today view; dated
  tasks mirror to a dedicated Planner calendar (service-account setup: see
  [docs/gcal-setup.md](docs/gcal-setup.md)).

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
