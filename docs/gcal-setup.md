# Google Calendar integration — one-time setup

The app reads your calendar and mirrors dated tasks to a dedicated "Planner"
calendar using a Google Cloud **service account** (no OAuth consent screens).
Takes ~15 minutes, once.

## 1. Create the service account

1. Go to https://console.cloud.google.com and create a new project (e.g. `timer-gcal`).
2. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account.**
   Name it (e.g. `timer`), skip the optional role/access steps, **Done**.
4. Open the new service account → **Keys → Add key → Create new key → JSON.**
   A `.json` key file downloads — treat it like a password.
5. Note the service account's email, e.g. `timer@timer-gcal.iam.gserviceaccount.com`.

## 2. Share your calendars with it

In Google Calendar (web), for your **main calendar**:

1. Settings → *Settings for my calendars* → your calendar → **Share with specific people or groups**.
2. Add the service-account email with **"See all event details"**.

Create the **Planner calendar** (the app writes here):

1. *Other calendars → + → Create new calendar* → name it `Planner` → Create.
2. Share it with the service-account email with **"Make changes to events"**.
3. In the Planner calendar's settings, copy its **Calendar ID** (under
   *Integrate calendar* — looks like `abc123...@group.calendar.google.com`).

Your main calendar's ID is simply your Gmail address.

## 3. Configure the app

In the app: **Settings → Google Calendar**:

1. Paste the entire contents of the downloaded JSON key file.
2. Read calendar IDs: your Gmail address (comma-separate more if needed).
3. Planner (push) calendar ID: the `...@group.calendar.google.com` ID.
4. **Save**, then **Test connection** — every calendar should show ✓.

## How it behaves

- Events from the read calendars appear in the Week board and Today view
  (read-only, cached ~5 minutes).
- Every task with a date is mirrored as an all-day event on the Planner
  calendar: moves, renames, completions (`✓ ` prefix) and deletions follow.
- The Planner calendar is **app-owned**: events you create there by hand will
  be removed by the hourly reconcile sweep. Don't put real appointments on it;
  toggle its visibility in Google Calendar as you like.
- Sync is best-effort: if Google is unreachable, task edits still work and the
  hourly sweep (also run at server start) repairs the calendar afterwards.
