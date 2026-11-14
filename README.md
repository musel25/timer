# ⏱ timer.musel.dev

A minimalist, powerful, customizable **interval timer + habit tracker** for the web — a clone of the
Android *Interval Timer* app, plus daily habits and progress tracking. Installable as a PWA, works
with a cached app shell and queued run logs. Account data syncs across devices behind a private login.

## Features

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
- **Navigation** — the left bar starts closed. Use the menu button to open
  **Week · Habits · Timer · Progress · Notes · Settings**. The Week planner is
  the home view. It shows per-day tasks and Google Calendar events, with today highlighted.
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
- **Android today widget** — an optional companion app shows the signed-in account's pending tasks
  for the current day on the home screen. See [Android widget](#android-widget).
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
| Android widget | Java + Android SDK 35, separate companion APK |

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

## Android widget

The installed PWA adds a home screen icon. A live task widget needs the Android companion APK.
It uses the existing Planner account and API. The widget reads only tasks owned by the account
that signs in to the companion app. Sign in as `musel` to see that account's tasks. The companion
app and your browser use separate sign-in sessions.

On your phone, tap [Download Planner Widget](https://github.com/musel25/timer/releases/latest/download/PlannerWidget.apk)
in a browser. Open the downloaded APK and approve installation.
Android may ask you to allow installs from your browser. The APK is signed with the same local key
for each release, so later releases can install over it. A GitHub Actions artifact uses a different
key. If you installed an Actions artifact, uninstall it once before you install the release APK.

To build the APK locally on Android 8.0 or newer:

```bash
cd android-widget
./gradlew lintDebug testDebugUnitTest assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Set `ANDROID_HOME` to your Android SDK path if Gradle cannot find it. You can also copy the APK to
your phone and open it there. Open **Planner Widget** and sign in with your Planner username and
password. Long-press an empty part of the home screen, open **Widgets**, and add **Planner Widget**.
Tap the refresh symbol to load tasks now. Android requests periodic updates about every 30 minutes.
The widget shows only tasks dated today. It hides completed, archived, and Inbox tasks. A widget tap opens the website. If the
account expires or a request fails, the widget hides the old task list. Sign out in the companion
app to remove its account session.

The companion app checks the latest GitHub release each time it opens. When a newer APK exists,
tap **Download update** in the app. Android requires you to approve the installation. It does not
install updates silently. Keep the local signing key to publish future APKs that install over this
one. The published APK is a release build signed with the local Android key used for the first
debug APK. GitHub Actions also offers a debug APK artifact for each run, but its signing key changes
between runs. The APK and signing key are not committed. The Android project is in `android-widget/`.

## Project layout

```
client/   React + Vite SPA (timer engine, dashboard, stats, settings)
server/   Hono API + Drizzle/SQLite + auth + seeding
android-widget/   optional Android home screen widget
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
