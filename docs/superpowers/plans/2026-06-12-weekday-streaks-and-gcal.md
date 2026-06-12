# Weekday-Only Streaks + Google Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Habit groups can be marked "weekdays only" so Work-habit streaks skip Sat/Sun; (2) two-way Google Calendar integration via a service account: events show in Week/Today, dated tasks mirror to a Planner calendar.

**Architecture:** Feature 1 adds a `weekdays_only` flag on `habit_groups` (with a one-time backfill for groups named "Work") and teaches the client-side `goalStreak()` to skip weekends. Feature 2 adds an `integrations` table holding the service-account key server-side only, a thin Google Calendar REST client (`google-auth-library` JWT + fetch), a `/api/calendar/*` route group, read-only event chips in the Week board and Today view, and a best-effort async push of dated tasks to a dedicated Planner calendar with an hourly reconcile sweep.

**Tech Stack:** Hono + Drizzle/better-sqlite3 + zod (server), React + TanStack Query + Vite (client), `google-auth-library` (new server dep), vitest both sides.

**Spec:** `docs/superpowers/specs/2026-06-12-weekday-streaks-and-gcal-design.md`

**Conventions for the executor:**
- Run server tests: `npm --prefix server test` (from repo root `/home/musel/Github/timer`).
- Run client tests: `npm --prefix client test`.
- The user's global rules require **pushing after every commit** (`git push`).
- Schema changes go in THREE places: `server/src/schema.ts` (Drizzle), `server/src/db.ts` `migrate()` (raw SQL), and `client/src/lib/types.ts` (TS types).

---

## Task 1: Server — `weekdays_only` column, backfill, seed, zod

**Files:**
- Create: `server/src/weekdaysOnly.test.ts`
- Modify: `server/src/db.ts`
- Modify: `server/src/schema.ts`
- Modify: `server/src/seed.ts`
- Modify: `server/src/api.ts` (groupInput zod)

- [ ] **Step 1: Write the failing migration test**

Create `server/src/weekdaysOnly.test.ts`. Note the pattern (copied from `hidden.test.ts`): `TIMER_DB` must be set before `./db` is imported, hence the dynamic imports.

```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-weekdays-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('weekdays_only migration + backfill', () => {
  let sqlite: import('better-sqlite3').Database;
  let migrate: typeof import('./db').migrate;

  beforeAll(async () => {
    ({ sqlite, migrate } = await import('./db'));
    // Simulate a database created before the column existed, with live rows.
    sqlite.exec(`
      CREATE TABLE habit_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO habit_groups (id, user_id, name) VALUES
        ('g-work', 'u1', 'Work'),
        ('g-morning', 'u1', 'Morning');
    `);
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const flag = (id: string) =>
    (sqlite.prepare('SELECT weekdays_only AS w FROM habit_groups WHERE id = ?').get(id) as { w: number }).w;

  it('adds the weekdays_only column', () => {
    const cols = sqlite.prepare('PRAGMA table_info(habit_groups)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('weekdays_only');
  });

  it('backfills weekdays_only=1 for groups named Work', () => {
    expect(flag('g-work')).toBe(1);
  });

  it('leaves other groups at 0', () => {
    expect(flag('g-morning')).toBe(0);
  });

  it('does not re-apply the backfill once the column exists', () => {
    sqlite.exec("UPDATE habit_groups SET weekdays_only = 0 WHERE id = 'g-work'");
    migrate(); // idempotent — column already present, so no backfill
    expect(flag('g-work')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix server test -- weekdaysOnly`
Expected: FAIL — `weekdays_only` column missing / backfill assertions fail.

- [ ] **Step 3: Implement the migration**

In `server/src/db.ts`:

(a) In the `CREATE TABLE IF NOT EXISTS habit_groups` block, add the column after `emoji TEXT,`:

```sql
    CREATE TABLE IF NOT EXISTS habit_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      weekdays_only INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
```

(b) Change `addColumnIfMissing` to report whether it added the column:

```ts
/** Add a column only when it's not already present (SQLite ALTER has no IF NOT EXISTS).
 *  Returns true when the column was just added — callers use this to run one-time backfills. */
function addColumnIfMissing(table: string, column: string, type: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    return true;
  }
  return false;
}
```

(c) At the end of `migrate()`, after the existing `addColumnIfMissing` calls:

```ts
  // Pre-existing DBs: add the flag and mark the conventional 'Work' group once.
  if (addColumnIfMissing('habit_groups', 'weekdays_only', 'INTEGER NOT NULL DEFAULT 0')) {
    sqlite.exec("UPDATE habit_groups SET weekdays_only = 1 WHERE name = 'Work'");
  }
```

In `server/src/schema.ts`, add to `habitGroups` after `emoji`:

```ts
  weekdaysOnly: integer('weekdays_only', { mode: 'boolean' }).notNull().default(false),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix server test -- weekdaysOnly`
Expected: PASS (4 tests).

- [ ] **Step 5: Seed + zod**

In `server/src/seed.ts`, replace the groups array so every literal carries the flag (keeps TS inference happy):

```ts
  const groups = [
    { name: 'Morning', emoji: '☀️', weekdaysOnly: false },
    { name: 'Work', emoji: '💼', weekdaysOnly: true },
    { name: 'Night', emoji: '🌙', weekdaysOnly: false },
  ].map((g, i) => ({ id: newId(), userId, name: g.name, emoji: g.emoji, weekdaysOnly: g.weekdaysOnly, sortOrder: i }));
```

In `server/src/api.ts`, extend `groupInput`:

```ts
const groupInput = z.object({
  name: z.string().min(1),
  emoji: z.string().nullable().optional(),
  weekdaysOnly: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
```

(The POST `/habit-groups` handler builds its row explicitly — add `weekdaysOnly: p.data.weekdaysOnly ?? false,` to that row object. PATCH spreads `p.data`, so it picks the field up automatically.)

- [ ] **Step 6: Run all server tests**

Run: `npm --prefix server test`
Expected: PASS (all suites).

- [ ] **Step 7: Commit and push**

```bash
git add server/src/db.ts server/src/schema.ts server/src/seed.ts server/src/api.ts server/src/weekdaysOnly.test.ts
git commit -m "feat(server): weekdays_only flag on habit groups with Work backfill"
git push
```

---

## Task 2: Client — weekend-skipping `goalStreak` + Progress wiring

**Files:**
- Modify: `client/src/lib/stats.ts:107-127` (`goalStreak`)
- Modify: `client/src/lib/stats.test.ts`
- Modify: `client/src/lib/types.ts:24-29` (`HabitGroup`)
- Modify: `client/src/features/stats/Progress.tsx`

- [ ] **Step 1: Write the failing tests**

In `client/src/lib/stats.test.ts`, change the vitest import to include timer helpers:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
```

Append this suite at the bottom. Dates are pinned with fake timers because `goalStreak` anchors on `startOfToday()` — June 8 2026 is a Monday.

```ts
describe('goalStreak with weekdaysOnly', () => {
  afterEach(() => vi.useRealTimers());

  // Local-noon timestamp for a calendar date.
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
  const h = (ts: number) => session(ts, { habitId: 'h1' }); // 600s = 1 block, meets the no-goal need of 1

  it('bridges the weekend: Friday met + Monday met = streak of 2', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 8, 12)); // Monday 2026-06-08
    const s = [h(at(2026, 6, 8)), h(at(2026, 6, 5))]; // Mon + previous Fri
    expect(goalStreak(s, 'h1', null, true)).toBe(2);
    expect(goalStreak(s, 'h1', null, false)).toBe(1); // sanity: weekend gap still breaks the normal streak
  });

  it('ignores weekend sessions entirely (no break, no bonus)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 8, 12)); // Monday
    // Monday met, Saturday session logged, Friday NOT met → streak is just Monday.
    const s = [h(at(2026, 6, 8)), h(at(2026, 6, 6))];
    expect(goalStreak(s, 'h1', null, true)).toBe(1);
  });

  it('still breaks on a missed weekday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12)); // Wednesday 2026-06-10
    // Wed met, Tue missed, Mon met → only Wednesday counts.
    const s = [h(at(2026, 6, 10)), h(at(2026, 6, 8))];
    expect(goalStreak(s, 'h1', null, true)).toBe(1);
  });

  it('grants the not-yet-met-today grace across a weekend (Monday morning sees Friday)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 8, 12)); // Monday, nothing logged yet today
    const s = [h(at(2026, 6, 5)), h(at(2026, 6, 4))]; // Fri + Thu
    expect(goalStreak(s, 'h1', null, true)).toBe(2);
  });

  it('anchors on Friday when today is a weekend day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 13, 12)); // Saturday 2026-06-13
    const s = [h(at(2026, 6, 12)), h(at(2026, 6, 11))]; // Fri + Thu
    expect(goalStreak(s, 'h1', null, true)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix client test -- stats`
Expected: FAIL — `goalStreak` ignores its 4th argument (TS may also error on arity; that counts as the failure).

- [ ] **Step 3: Implement weekend skipping**

In `client/src/lib/stats.ts`, replace `goalStreak` (keep its doc comment, extend it):

```ts
const isWeekend = (ts: number) => {
  const day = new Date(ts).getDay();
  return day === 0 || day === 6;
};

/**
 * Consecutive days (ending today, or yesterday when today isn't met yet) on
 * which the habit completed `goalBlocks` blocks — or at least one block when
 * it has no goal. With `weekdaysOnly`, Saturdays and Sundays are invisible:
 * they never break the streak and never count toward it.
 */
export function goalStreak(sessions: Session[], habitId: string, dailyGoalMin: number | null, weekdaysOnly = false): number {
  const need = goalBlocks(dailyGoalMin) ?? 1;
  const minByDay: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.completed || s.habitId !== habitId) continue;
    const k = dayKey(s.startedAt);
    minByDay[k] = (minByDay[k] ?? 0) + s.actualSeconds / 60;
  }
  const met = (ts: number) => Math.floor((minByDay[dayKey(ts)] ?? 0) / 10) >= need;
  const back = (ts: number) => {
    let c = addDays(ts, -1);
    while (weekdaysOnly && isWeekend(c)) c = addDays(c, -1);
    return c;
  };
  let cursor = startOfToday();
  while (weekdaysOnly && isWeekend(cursor)) cursor = addDays(cursor, -1);
  if (!met(cursor)) {
    cursor = back(cursor);
    if (!met(cursor)) return 0;
  }
  let streak = 0;
  while (met(cursor)) {
    streak += 1;
    cursor = back(cursor);
  }
  return streak;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix client test -- stats`
Expected: PASS (all stats suites, old and new).

- [ ] **Step 5: Type + Progress wiring**

In `client/src/lib/types.ts`, add to `HabitGroup`:

```ts
export interface HabitGroup {
  id: string;
  name: string;
  emoji: string | null;
  weekdaysOnly: boolean;
  sortOrder: number;
}
```

In `client/src/features/stats/Progress.tsx`:

(a) Add `useGroups` to the hooks import (line 3):

```ts
import { useGroups, useHabits, useSessions, useSettings } from '../../lib/hooks';
```

(b) Inside `Progress()`, after the existing queries:

```ts
  const { data: groups = [] } = useGroups();
  const weekdaysOnlyGroups = new Set(groups.filter((g) => g.weekdaysOnly).map((g) => g.id));
```

(c) Change the `streak:` line in the `ranked` mapping (line 37):

```ts
      streak: goalStreak(sessions, h.id, h.dailyGoalMin, !!h.groupId && weekdaysOnlyGroups.has(h.groupId)),
```

- [ ] **Step 6: Run all client tests and typecheck via build**

Run: `npm --prefix client test && npm run build`
Expected: tests PASS, build succeeds.

- [ ] **Step 7: Commit and push**

```bash
git add client/src/lib/stats.ts client/src/lib/stats.test.ts client/src/lib/types.ts client/src/features/stats/Progress.tsx
git commit -m "feat(stats): weekday-only streaks skip weekends for flagged habit groups"
git push
```

---

## Task 3: Client — "Mon–Fri" toggle on group rows in Settings

**Files:**
- Modify: `client/src/features/settings/Settings.tsx:130-148` (Groups section)

- [ ] **Step 1: Add the toggle**

In the Groups section of `Settings.tsx`, replace the group-row JSX (the `groups.map((g) => ...)` block) with:

```tsx
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="card flex items-center justify-between p-3 text-sm">
              <span className="flex items-center gap-2"><HabitIcon name={g.emoji} size={16} className="text-slate-300" /> {g.name}</span>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <label className="flex items-center gap-1.5" title="Streaks skip Sat/Sun for habits in this group">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={!!g.weekdaysOnly}
                    onChange={(e) => saveGroup.mutate({ id: g.id, weekdaysOnly: e.target.checked })}
                  />
                  Mon–Fri
                </label>
                <button
                  className="hover:text-slate-300"
                  onClick={() => {
                    const name = window.prompt('Rename group', g.name);
                    if (name) saveGroup.mutate({ id: g.id, name });
                  }}
                >
                  Rename
                </button>
                <button className="hover:text-rose-400" onClick={() => delGroup.mutate(g.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual smoke check (optional but cheap)**

Run `npm run dev`, open http://localhost:5173/settings, confirm the Work group shows "Mon–Fri" checked (after the server migrated the prod-shaped DB) and toggling persists across reload. Stop the dev server.

- [ ] **Step 4: Commit and push**

```bash
git add client/src/features/settings/Settings.tsx
git commit -m "feat(settings): per-group weekdays-only toggle for streaks"
git push
```

---

## Task 4: Server — Google client module (`gcal.ts`) + dependency

**Files:**
- Create: `server/src/gcal.ts`
- Create: `server/src/gcal.test.ts`
- Modify: `server/package.json` (via `npm install`)

- [ ] **Step 1: Install the dependency**

```bash
npm --prefix server install google-auth-library
```

- [ ] **Step 2: Write failing tests for the pure helpers**

Create `server/src/gcal.test.ts` (pure functions only — no network, no db, so plain static imports are fine):

```ts
import { describe, expect, it } from 'vitest';
import { normalizeEvent, redactConfig, serviceAccountEmail, type GcalConfig } from './gcal';

const cfg: GcalConfig = {
  serviceAccountJson: JSON.stringify({
    type: 'service_account',
    client_email: 'timer@proj.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nSECRETSECRET\n-----END PRIVATE KEY-----\n',
  }),
  readCalendarIds: ['me@gmail.com'],
  pushCalendarId: 'abc@group.calendar.google.com',
};

describe('redactConfig', () => {
  it('never leaks the private key', () => {
    const out = JSON.stringify(redactConfig(cfg));
    expect(out).not.toContain('private_key');
    expect(out).not.toContain('SECRETSECRET');
    expect(out).not.toContain('serviceAccountJson');
  });

  it('exposes metadata for the settings UI', () => {
    expect(redactConfig(cfg)).toEqual({
      configured: true,
      clientEmail: 'timer@proj.iam.gserviceaccount.com',
      readCalendarIds: ['me@gmail.com'],
      pushCalendarId: 'abc@group.calendar.google.com',
    });
  });

  it('handles the unconfigured case', () => {
    expect(redactConfig(null)).toEqual({ configured: false });
  });
});

describe('serviceAccountEmail', () => {
  it('returns null on malformed JSON', () => {
    expect(serviceAccountEmail({ ...cfg, serviceAccountJson: 'not json' })).toBeNull();
  });
});

describe('normalizeEvent', () => {
  it('normalizes a timed event', () => {
    expect(
      normalizeEvent(
        { id: 'e1', summary: 'Standup', start: { dateTime: '2026-06-08T09:00:00+02:00' }, end: { dateTime: '2026-06-08T09:30:00+02:00' } },
        'me@gmail.com',
      ),
    ).toEqual({ id: 'e1', calendarId: 'me@gmail.com', title: 'Standup', start: '2026-06-08T09:00:00+02:00', end: '2026-06-08T09:30:00+02:00', allDay: false });
  });

  it('normalizes an all-day event', () => {
    expect(
      normalizeEvent({ id: 'e2', summary: 'Trip', start: { date: '2026-06-08' }, end: { date: '2026-06-10' } }, 'me@gmail.com'),
    ).toEqual({ id: 'e2', calendarId: 'me@gmail.com', title: 'Trip', start: '2026-06-08', end: '2026-06-10', allDay: true });
  });

  it('drops cancelled events and events without times, and defaults the title', () => {
    expect(normalizeEvent({ id: 'e3', status: 'cancelled', start: { date: '2026-06-08' }, end: { date: '2026-06-09' } }, 'c')).toBeNull();
    expect(normalizeEvent({ id: 'e4' }, 'c')).toBeNull();
    expect(normalizeEvent({ id: 'e5', start: { date: '2026-06-08' }, end: { date: '2026-06-09' } }, 'c')?.title).toBe('(no title)');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm --prefix server test -- gcal`
Expected: FAIL — module `./gcal` does not exist.

- [ ] **Step 4: Implement `server/src/gcal.ts`**

```ts
/** Thin Google Calendar v3 client for a service account.
 *  Auth: google-auth-library JWT; the service account must be granted access
 *  by sharing each calendar with its client_email (see docs/gcal-setup.md). */
import { JWT } from 'google-auth-library';

const API = 'https://www.googleapis.com/calendar/v3';

export interface GcalConfig {
  serviceAccountJson: string; // raw key-file JSON — server-side only, never sent to the client
  readCalendarIds: string[];
  pushCalendarId: string | null;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO datetime, or 'YYYY-MM-DD' when allDay
  end: string;   // exclusive for all-day events (Google convention)
  allDay: boolean;
}

export interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export function serviceAccountEmail(cfg: GcalConfig): string | null {
  try {
    return (JSON.parse(cfg.serviceAccountJson).client_email as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Public view of the config for the settings UI — NEVER includes the key. */
export function redactConfig(cfg: GcalConfig | null) {
  if (!cfg) return { configured: false as const };
  return {
    configured: true as const,
    clientEmail: serviceAccountEmail(cfg),
    readCalendarIds: cfg.readCalendarIds,
    pushCalendarId: cfg.pushCalendarId,
  };
}

export function normalizeEvent(raw: RawEvent, calendarId: string): CalendarEvent | null {
  if (raw.status === 'cancelled') return null;
  const start = raw.start?.dateTime ?? raw.start?.date;
  const end = raw.end?.dateTime ?? raw.end?.date;
  if (!start || !end) return null;
  return { id: raw.id, calendarId, title: raw.summary ?? '(no title)', start, end, allDay: !!raw.start?.date };
}

function jwt(cfg: GcalConfig): JWT {
  const key = JSON.parse(cfg.serviceAccountJson);
  return new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/calendar'] });
}

const calUrl = (calendarId: string, rest = '') => `${API}/calendars/${encodeURIComponent(calendarId)}/events${rest}`;

/** Cheap reachability probe used by the settings "Test connection" button. */
export async function testCalendar(cfg: GcalConfig, calendarId: string): Promise<void> {
  await jwt(cfg).request({ url: `${API}/calendars/${encodeURIComponent(calendarId)}` });
}

/* ---- read (with a 5-minute cache so the Week board doesn't hammer the API) ---- */
const cache = new Map<string, { at: number; data: CalendarEvent[] }>();
const TTL = 5 * 60 * 1000;
export function clearEventsCache(): void {
  cache.clear();
}

export async function listEvents(cfg: GcalConfig, calendarId: string, fromKey: string, toKey: string): Promise<CalendarEvent[]> {
  const key = `${calendarId}|${fromKey}|${toKey}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  // Widen by a day each side: the server may run in a different timezone than
  // the user; the client buckets events into its own local days.
  const timeMin = new Date(`${fromKey}T00:00:00Z`);
  timeMin.setUTCDate(timeMin.getUTCDate() - 1);
  const timeMax = new Date(`${toKey}T00:00:00Z`);
  timeMax.setUTCDate(timeMax.getUTCDate() + 2);
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const res = await jwt(cfg).request<{ items?: RawEvent[] }>({ url: calUrl(calendarId, `?${params}`) });
  const events = (res.data.items ?? [])
    .map((e) => normalizeEvent(e, calendarId))
    .filter((e): e is CalendarEvent => e !== null);
  cache.set(key, { at: Date.now(), data: events });
  return events;
}

/* ---- write (push side) ---- */
export interface EventBody {
  summary: string;
  start: { date: string };
  end: { date: string };
}

export async function insertEvent(cfg: GcalConfig, calendarId: string, eventBody: EventBody): Promise<string> {
  const res = await jwt(cfg).request<{ id: string }>({ url: calUrl(calendarId), method: 'POST', data: eventBody });
  return res.data.id;
}

export async function patchEvent(cfg: GcalConfig, calendarId: string, eventId: string, eventBody: EventBody): Promise<void> {
  await jwt(cfg).request({ url: calUrl(calendarId, `/${encodeURIComponent(eventId)}`), method: 'PATCH', data: eventBody });
}

export async function deleteEvent(cfg: GcalConfig, calendarId: string, eventId: string): Promise<void> {
  try {
    await jwt(cfg).request({ url: calUrl(calendarId, `/${encodeURIComponent(eventId)}`), method: 'DELETE' });
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status !== 404 && status !== 410) throw e; // already gone is fine
  }
}

/** Every event on a calendar within ±1 year, paginated. Used by the reconcile sweep. */
export async function listAllEvents(cfg: GcalConfig, calendarId: string): Promise<RawEvent[]> {
  const out: RawEvent[] = [];
  const timeMin = new Date();
  timeMin.setUTCFullYear(timeMin.getUTCFullYear() - 1);
  const timeMax = new Date();
  timeMax.setUTCFullYear(timeMax.getUTCFullYear() + 1);
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await jwt(cfg).request<{ items?: RawEvent[]; nextPageToken?: string }>({ url: calUrl(calendarId, `?${params}`) });
    out.push(...(res.data.items ?? []).filter((e) => e.status !== 'cancelled'));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix server test -- gcal`
Expected: PASS.

- [ ] **Step 6: Commit and push**

```bash
git add server/src/gcal.ts server/src/gcal.test.ts server/package.json server/package-lock.json
git commit -m "feat(server): Google Calendar service-account client with event normalization"
git push
```

---

## Task 5: Server — `integrations` table + `/api/calendar` config & events routes

**Files:**
- Modify: `server/src/schema.ts`
- Modify: `server/src/db.ts`
- Create: `server/src/calendar.ts`
- Modify: `server/src/api.ts`

- [ ] **Step 1: Schema + migration**

In `server/src/schema.ts`, change the first import line and append the table:

```ts
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
```

```ts
/** Per-user external-service configs (e.g. kind='gcal'). The config JSON can
 *  hold secrets — API routes must return it only through redactConfig(). */
export const integrations = sqliteTable(
  'integrations',
  {
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    config: text('config', { mode: 'json' }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.kind] }) }),
);
```

In `server/src/db.ts` `migrate()`, append inside the big `sqlite.exec` template, after the `tasks` block:

```sql
    CREATE TABLE IF NOT EXISTS integrations (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      config TEXT NOT NULL,
      PRIMARY KEY (user_id, kind)
    );
```

- [ ] **Step 2: Create `server/src/calendar.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { integrations } from './schema';
import { clearEventsCache, listEvents, redactConfig, testCalendar, type GcalConfig } from './gcal';

type Env = { Variables: { userId: string } };
const uid = (c: { get(k: 'userId'): string }) => c.get('userId');

export function getGcalConfig(userId: string): GcalConfig | null {
  const row = db.select().from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, 'gcal'))).get();
  return (row?.config as GcalConfig | undefined) ?? null;
}

export const calendar = new Hono<Env>();

calendar.get('/config', (c) => c.json(redactConfig(getGcalConfig(uid(c)))));

const configInput = z.object({
  serviceAccountJson: z.string().min(1).optional(), // omitted = keep the stored key
  readCalendarIds: z.array(z.string().min(1)).optional(),
  pushCalendarId: z.string().min(1).nullable().optional(),
});

calendar.put('/config', async (c) => {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = {}; }
  const p = configInput.safeParse(raw);
  if (!p.success) return c.json({ error: 'invalid_input' }, 400);
  const prev = getGcalConfig(uid(c));
  const next: GcalConfig = {
    serviceAccountJson: p.data.serviceAccountJson ?? prev?.serviceAccountJson ?? '',
    readCalendarIds: p.data.readCalendarIds ?? prev?.readCalendarIds ?? [],
    pushCalendarId: p.data.pushCalendarId !== undefined ? p.data.pushCalendarId : (prev?.pushCalendarId ?? null),
  };
  try {
    const key = JSON.parse(next.serviceAccountJson);
    if (!key.client_email || !key.private_key) return c.json({ error: 'invalid_key' }, 400);
  } catch {
    return c.json({ error: 'invalid_key' }, 400);
  }
  db.insert(integrations)
    .values({ userId: uid(c), kind: 'gcal', config: next })
    .onConflictDoUpdate({ target: [integrations.userId, integrations.kind], set: { config: next } })
    .run();
  clearEventsCache();
  return c.json(redactConfig(next));
});

calendar.delete('/config', (c) => {
  db.delete(integrations).where(and(eq(integrations.userId, uid(c)), eq(integrations.kind, 'gcal'))).run();
  clearEventsCache();
  return c.json({ ok: true });
});

calendar.post('/test', async (c) => {
  const cfg = getGcalConfig(uid(c));
  if (!cfg) return c.json({ error: 'not_configured' }, 400);
  const ids = [...cfg.readCalendarIds, ...(cfg.pushCalendarId ? [cfg.pushCalendarId] : [])];
  const results = await Promise.all(
    ids.map(async (calendarId) => {
      try {
        await testCalendar(cfg, calendarId);
        return { calendarId, ok: true as const };
      } catch (e) {
        return { calendarId, ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return c.json({ results });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

calendar.get('/events', async (c) => {
  const cfg = getGcalConfig(uid(c));
  if (!cfg || cfg.readCalendarIds.length === 0) return c.json({ configured: false, events: [] });
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return c.json({ error: 'invalid_input' }, 400);
  try {
    const lists = await Promise.all(cfg.readCalendarIds.map((id) => listEvents(cfg, id, from, to)));
    return c.json({ configured: true, events: lists.flat() });
  } catch (e) {
    console.error('[gcal] events fetch failed:', e);
    return c.json({ error: 'calendar_unavailable' }, 502);
  }
});
```

- [ ] **Step 3: Mount in `server/src/api.ts`**

Add to the imports:

```ts
import { calendar } from './calendar';
```

In the "everything below requires auth" block, add:

```ts
api.use('/calendar', requireAuth); api.use('/calendar/*', requireAuth);
```

And after the route definitions (e.g. right after the tasks section, before settings):

```ts
/* ---------- calendar (Google Calendar integration) ---------- */
api.route('/calendar', calendar);
```

- [ ] **Step 4: Run server tests + build**

Run: `npm --prefix server test && npm --prefix server run build`
Expected: PASS / build succeeds.

- [ ] **Step 5: Commit and push**

```bash
git add server/src/schema.ts server/src/db.ts server/src/calendar.ts server/src/api.ts
git commit -m "feat(server): integrations storage and /api/calendar config + events routes"
git push
```

---

## Task 6: Client — calendar events in Week board and Today view

**Files:**
- Create: `client/src/lib/calendar.ts`
- Create: `client/src/lib/calendar.test.ts`
- Create: `client/src/components/EventChip.tsx`
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/hooks.ts`
- Modify: `client/src/features/tasks/WeekBoard.tsx`
- Modify: `client/src/features/tasks/TodayView.tsx`

- [ ] **Step 1: Write the failing bucketing tests**

Create `client/src/lib/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { eventsByDay } from './calendar';
import type { CalendarEvent } from './types';

const ev = (o: Partial<CalendarEvent>): CalendarEvent => ({
  id: Math.random().toString(36).slice(2),
  calendarId: 'c',
  title: 'x',
  start: '2026-06-08',
  end: '2026-06-09',
  allDay: true,
  ...o,
});

describe('eventsByDay', () => {
  it('buckets a timed event on its local start day', () => {
    // Local-time ISO string (no Z) so the test is timezone-independent.
    const m = eventsByDay([ev({ allDay: false, start: '2026-06-08T09:00:00', end: '2026-06-08T09:30:00' })]);
    expect(m.get('2026-06-08')?.length).toBe(1);
  });

  it('spans a multi-day all-day event across [start, end)', () => {
    const m = eventsByDay([ev({ start: '2026-06-08', end: '2026-06-10' })]);
    expect(m.get('2026-06-08')?.length).toBe(1);
    expect(m.get('2026-06-09')?.length).toBe(1);
    expect(m.get('2026-06-10')).toBeUndefined(); // end is exclusive
  });

  it('sorts all-day events before timed ones, then by start', () => {
    const m = eventsByDay([
      ev({ id: 'late', allDay: false, start: '2026-06-08T15:00:00', end: '2026-06-08T16:00:00' }),
      ev({ id: 'early', allDay: false, start: '2026-06-08T08:00:00', end: '2026-06-08T09:00:00' }),
      ev({ id: 'allday', start: '2026-06-08', end: '2026-06-09' }),
    ]);
    expect(m.get('2026-06-08')!.map((e) => e.id)).toEqual(['allday', 'early', 'late']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix client test -- calendar`
Expected: FAIL — `./calendar` does not exist.

- [ ] **Step 3: Implement types + helpers**

In `client/src/lib/types.ts`, append:

```ts
export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO datetime, or 'YYYY-MM-DD' when allDay
  end: string;   // exclusive for all-day events
  allDay: boolean;
}
```

Create `client/src/lib/calendar.ts`:

```ts
import type { CalendarEvent } from './types';
import { dayKey } from './time';
import { addDaysKey } from './date';

/** Bucket events by local day key. All-day events span [start, end) — Google's
 *  all-day `end` date is exclusive. Timed events land on their local start day. */
export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const push = (k: string, e: CalendarEvent) => {
    const arr = map.get(k) ?? [];
    arr.push(e);
    map.set(k, arr);
  };
  for (const e of events) {
    if (e.allDay) {
      for (let k = e.start; k < e.end; k = addDaysKey(k, 1)) push(k, e);
    } else {
      push(dayKey(new Date(e.start).getTime()), e);
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.localeCompare(b.start));
  }
  return map;
}

/** "9:00 AM" for timed events, null for all-day. */
export function eventTimeLabel(e: CalendarEvent): string | null {
  if (e.allDay) return null;
  return new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix client test -- calendar`
Expected: PASS.

- [ ] **Step 5: Query hook + chip component**

In `client/src/lib/hooks.ts`:

(a) extend the types import:

```ts
import type { CalendarEvent, Habit, HabitGroup, Session, Settings, Task, TimerPreset } from './types';
```

(b) append:

```ts
/* ---- calendar (read-only Google events) ---- */
export function useCalendarEvents(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar-events', from, to],
    queryFn: () => api.get<{ configured: boolean; events: CalendarEvent[] }>(`/calendar/events?from=${from}&to=${to}`),
    select: (d) => d.events,
    staleTime: 5 * 60 * 1000,
    retry: false, // unconfigured/unreachable calendar should fail quietly, not retry-spam
  });
}
```

Create `client/src/components/EventChip.tsx`:

```tsx
import { CalendarClock } from 'lucide-react';
import type { CalendarEvent } from '../lib/types';
import { eventTimeLabel } from '../lib/calendar';

/** Read-only Google Calendar event — deliberately muted next to tasks. */
export function EventChip({ event }: { event: CalendarEvent }) {
  const time = eventTimeLabel(event);
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-ink-600/60 bg-ink-900/40 px-2 py-1.5 text-xs text-slate-400" title={event.title}>
      <CalendarClock size={12} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words leading-snug">{event.title}</span>
      {time && <span className="shrink-0 tabular-nums">{time}</span>}
    </div>
  );
}
```

- [ ] **Step 6: Week board wiring**

In `client/src/features/tasks/WeekBoard.tsx`:

(a) imports:

```ts
import { useTasks, useSaveTask, useToggleTask, useCalendarEvents } from '../../lib/hooks';
import type { CalendarEvent, Task } from '../../lib/types';
import { eventsByDay } from '../../lib/calendar';
import { EventChip } from '../../components/EventChip';
```

(b) `DayColumn` gains an `events` prop and renders chips above the drop zone:

```tsx
function DayColumn({ dayKey, tasks, events, onEdit, dragHappened }: { dayKey: string; tasks: Task[]; events: CalendarEvent[]; onEdit: (t: Task) => void; dragHappened: React.MutableRefObject<boolean> }) {
  const d = keyToDate(dayKey);
  const isToday = dayKey === todayKey();
  return (
    <div
      className={`card flex flex-col p-3 ${isToday ? 'ring-1 ring-accent/50' : ''}`}
      style={isToday ? { backgroundImage: 'linear-gradient(160deg, rgb(var(--accent) / 0.14), transparent 65%)' } : undefined}
    >
      <div className={`mb-2 flex items-baseline justify-between px-1 ${isToday ? 'text-accent' : 'text-slate-400'}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span className="text-lg font-bold">{d.getDate()}</span>
      </div>
      {events.length > 0 && (
        <div className="mb-1.5 space-y-1 px-1">
          {events.map((e) => <EventChip key={e.id} event={e} />)}
        </div>
      )}
      <DropColumn id={dayKey}>
        {tasks.map((t) => <DraggableTask key={t.id} task={t} onEdit={onEdit} dragHappened={dragHappened} />)}
      </DropColumn>
      <div className="mt-2"><QuickAdd date={dayKey} placeholder="Add task" compact /></div>
    </div>
  );
}
```

(c) In `WeekBoard()`, after `const days = weekDays(anchor, 1);`:

```ts
  const { data: events = [] } = useCalendarEvents(days[0], days[6]);
  const evByDay = eventsByDay(events);
```

and pass them to each column:

```tsx
          {days.map((key) => <DayColumn key={key} dayKey={key} tasks={byDate(key)} events={evByDay.get(key) ?? []} onEdit={setEditing} dragHappened={dragHappened} />)}
```

- [ ] **Step 7: Today view wiring**

In `client/src/features/tasks/TodayView.tsx`:

(a) imports:

```ts
import { useTasks, useHabits, useSessions, useSettings, useSaveTask, useSaveHabit, useCalendarEvents } from '../../lib/hooks';
import { eventsByDay } from '../../lib/calendar';
import { EventChip } from '../../components/EventChip';
```

(b) after `const tk = todayKey();`:

```ts
  const { data: events = [] } = useCalendarEvents(tk, tk);
  const todayEvents = eventsByDay(events).get(tk) ?? [];
```

(c) Inside the Tasks `<section>`, directly after `<h2 className="label mb-3">Tasks</h2>`:

```tsx
          {todayEvents.length > 0 && (
            <div className="mb-3 space-y-1">
              {todayEvents.map((e) => <EventChip key={e.id} event={e} />)}
            </div>
          )}
```

- [ ] **Step 8: Run client tests + build**

Run: `npm --prefix client test && npm run build`
Expected: PASS / build succeeds.

- [ ] **Step 9: Commit and push**

```bash
git add client/src/lib/calendar.ts client/src/lib/calendar.test.ts client/src/lib/types.ts client/src/lib/hooks.ts client/src/components/EventChip.tsx client/src/features/tasks/WeekBoard.tsx client/src/features/tasks/TodayView.tsx
git commit -m "feat(client): show Google Calendar events in Week board and Today view"
git push
```

---

## Task 7: Client — Settings "Google Calendar" integration card

**Files:**
- Create: `client/src/features/settings/CalendarIntegration.tsx`
- Modify: `client/src/lib/api.ts` (add `put`)
- Modify: `client/src/features/settings/Settings.tsx`

- [ ] **Step 1: Add `put` to the API helper**

In `client/src/lib/api.ts`, extend the exported object:

```ts
export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};
```

- [ ] **Step 2: Create `client/src/features/settings/CalendarIntegration.tsx`**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface CalConfig {
  configured: boolean;
  clientEmail?: string | null;
  readCalendarIds?: string[];
  pushCalendarId?: string | null;
}

interface TestResult {
  calendarId: string;
  ok: boolean;
  error?: string;
}

export function CalendarIntegration() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ['calendar-config'], queryFn: () => api.get<CalConfig>('/calendar/config') });
  const [keyJson, setKeyJson] = useState('');
  // null = "not edited yet, show the stored value"
  const [readIds, setReadIds] = useState<string | null>(null);
  const [pushId, setPushId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [testing, setTesting] = useState(false);

  const readValue = readIds ?? cfg?.readCalendarIds?.join(', ') ?? '';
  const pushValue = pushId ?? cfg?.pushCalendarId ?? '';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['calendar-config'] });
    qc.invalidateQueries({ queryKey: ['calendar-events'] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<CalConfig>('/calendar/config', {
        ...(keyJson.trim() ? { serviceAccountJson: keyJson.trim() } : {}),
        readCalendarIds: readValue.split(',').map((s) => s.trim()).filter(Boolean),
        pushCalendarId: pushValue.trim() || null,
      }),
    onSuccess: () => {
      setKeyJson('');
      setTestResults(null);
      invalidate();
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.del('/calendar/config'),
    onSuccess: () => {
      setReadIds(null);
      setPushId(null);
      setTestResults(null);
      invalidate();
    },
  });

  async function test() {
    setTesting(true);
    setTestResults(null);
    try {
      const r = await api.post<{ results: TestResult[] }>('/calendar/test');
      setTestResults(r.results);
    } catch {
      setTestResults([{ calendarId: '(connection)', ok: false, error: 'request failed' }]);
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="label">Google Calendar</h2>
      {cfg?.configured ? (
        <p className="text-sm text-slate-400">
          Connected as <span className="break-all text-slate-200">{cfg.clientEmail}</span> — share your calendars with this email.
        </p>
      ) : (
        <p className="text-sm text-slate-400">
          Paste a Google service-account key to connect (setup steps in <code>docs/gcal-setup.md</code>).
        </p>
      )}
      <textarea
        className="input h-24 font-mono text-xs"
        placeholder={cfg?.configured ? 'Paste a new key JSON to replace the stored one' : 'Service-account key JSON ({"type":"service_account",...})'}
        value={keyJson}
        onChange={(e) => setKeyJson(e.target.value)}
      />
      <input
        className="input"
        placeholder="Read calendar IDs, comma-separated (e.g. you@gmail.com)"
        value={readValue}
        onChange={(e) => setReadIds(e.target.value)}
      />
      <input
        className="input"
        placeholder="Planner (push) calendar ID — optional"
        value={pushValue}
        onChange={(e) => setPushId(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-outline flex-1"
          onClick={() => save.mutate()}
          disabled={save.isPending || (!cfg?.configured && !keyJson.trim())}
        >
          Save
        </button>
        <button className="btn-outline flex-1" onClick={test} disabled={!cfg?.configured || testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {cfg?.configured && (
          <button className="btn-outline flex-1 text-rose-400" onClick={() => disconnect.mutate()}>
            Disconnect
          </button>
        )}
      </div>
      {save.isError && <p className="text-sm text-rose-400">Save failed — check the key JSON.</p>}
      {testResults && (
        <ul className="space-y-1 text-sm">
          {testResults.map((r) => (
            <li key={r.calendarId} className={r.ok ? 'text-accent' : 'text-rose-400'}>
              {r.ok ? '✓' : '✗'} <span className="break-all">{r.calendarId}</span>
              {r.error ? ` — ${r.error}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Mount in Settings**

In `client/src/features/settings/Settings.tsx`:

```ts
import { CalendarIntegration } from './CalendarIntegration';
```

and render it between the Groups section and the Data section:

```tsx
      <CalendarIntegration />
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit and push**

```bash
git add client/src/lib/api.ts client/src/features/settings/CalendarIntegration.tsx client/src/features/settings/Settings.tsx
git commit -m "feat(settings): Google Calendar integration card (key, calendar IDs, test)"
git push
```

---

## Task 8: Server — push dated tasks to the Planner calendar + reconcile sweep

**Files:**
- Create: `server/src/gcalSync.ts`
- Create: `server/src/gcalSync.test.ts`
- Modify: `server/src/schema.ts` (tasks.gcalEventId)
- Modify: `server/src/db.ts` (column)
- Modify: `server/src/api.ts` (task CRUD hooks)
- Modify: `server/src/index.ts` (start sweep)

- [ ] **Step 1: Write the failing tests for the pure sync logic**

Create `server/src/gcalSync.test.ts`. `gcalSync.ts` imports `./db` at module load, so it uses the same env-stub + dynamic-import pattern as `hidden.test.ts`:

```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing modules that import db.ts.
const dir = mkdtempSync(join(tmpdir(), 'timer-gcalsync-'));
process.env.TIMER_DB = join(dir, 'test.db');

type Sync = typeof import('./gcalSync');
let sync: Sync;

beforeAll(async () => {
  const { migrate } = await import('./db');
  migrate();
  sync = await import('./gcalSync');
});

afterAll(async () => {
  const { sqlite } = await import('./db');
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const task = (o: Partial<Parameters<Sync['planReconcile']>[0][number]> = {}) => ({
  id: 't1',
  title: 'Buy milk',
  date: '2026-06-12' as string | null,
  done: false,
  gcalEventId: null as string | null,
  ...o,
});

describe('eventTitle', () => {
  it('prefixes done tasks with a check', () => {
    expect(sync.eventTitle({ title: 'Buy milk', done: false })).toBe('Buy milk');
    expect(sync.eventTitle({ title: 'Buy milk', done: true })).toBe('✓ Buy milk');
  });
});

describe('nextDay', () => {
  it('handles month and year rollovers', () => {
    expect(sync.nextDay('2026-06-12')).toBe('2026-06-13');
    expect(sync.nextDay('2026-06-30')).toBe('2026-07-01');
    expect(sync.nextDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('taskToEventBody', () => {
  it('builds an all-day event with exclusive end date', () => {
    expect(sync.taskToEventBody(task())).toEqual({
      summary: 'Buy milk',
      start: { date: '2026-06-12' },
      end: { date: '2026-06-13' },
    });
  });
});

describe('planReconcile', () => {
  const ev = (id: string, summary: string, date: string) => ({ id, summary, start: { date }, end: { date: sync.nextDay(date) } });

  it('inserts tasks with no event (or a dangling event id)', () => {
    const plan = sync.planReconcile([task(), task({ id: 't2', gcalEventId: 'gone' })], []);
    expect(plan.inserts.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(plan.patches).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('patches when title or date drift', () => {
    const events = [ev('e1', 'Old title', '2026-06-12'), ev('e2', 'Same', '2026-06-10')];
    const plan = sync.planReconcile(
      [task({ gcalEventId: 'e1' }), task({ id: 't2', title: 'Same', date: '2026-06-11', gcalEventId: 'e2' })],
      events,
    );
    expect(plan.patches.map((p) => p.eventId).sort()).toEqual(['e1', 'e2']);
    expect(plan.inserts).toEqual([]);
  });

  it('patches when done state changed (title prefix)', () => {
    const plan = sync.planReconcile([task({ done: true, gcalEventId: 'e1' })], [ev('e1', 'Buy milk', '2026-06-12')]);
    expect(plan.patches.length).toBe(1);
  });

  it('leaves in-sync pairs alone and deletes orphans', () => {
    const plan = sync.planReconcile(
      [task({ gcalEventId: 'e1' })],
      [ev('e1', 'Buy milk', '2026-06-12'), ev('e-orphan', 'Manual junk', '2026-06-12')],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.patches).toEqual([]);
    expect(plan.deletes).toEqual(['e-orphan']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- gcalSync`
Expected: FAIL — module `./gcalSync` does not exist.

- [ ] **Step 3: Schema + migration for `gcal_event_id`**

In `server/src/schema.ts`, add to the `tasks` table after `sortOrder`:

```ts
  // Google Calendar event mirroring this task on the Planner calendar, or NULL
  gcalEventId: text('gcal_event_id'),
```

In `server/src/db.ts` `migrate()`, with the other idempotent column additions:

```ts
  addColumnIfMissing('tasks', 'gcal_event_id', 'TEXT');
```

- [ ] **Step 4: Implement `server/src/gcalSync.ts`**

```ts
/** Best-effort mirroring of dated tasks onto a Google "Planner" calendar.
 *  All entry points are fire-and-forget: a Google failure must never block or
 *  fail a task operation — the reconcile sweep repairs drift later. */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { tasks, users } from './schema';
import { getGcalConfig } from './calendar';
import { deleteEvent, insertEvent, listAllEvents, patchEvent, type EventBody, type RawEvent } from './gcal';

export interface SyncTask {
  id: string;
  title: string;
  date: string | null;
  done: boolean;
  gcalEventId: string | null;
}

export function eventTitle(t: Pick<SyncTask, 'title' | 'done'>): string {
  return t.done ? `✓ ${t.title}` : t.title;
}

/** 'YYYY-MM-DD' + 1 day, pure string math via UTC (no timezone drift). */
export function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** All-day event body for a dated task. Google's all-day `end.date` is exclusive. */
export function taskToEventBody(t: Pick<SyncTask, 'title' | 'done' | 'date'>): EventBody {
  if (!t.date) throw new Error('taskToEventBody requires a dated task');
  return { summary: eventTitle(t), start: { date: t.date }, end: { date: nextDay(t.date) } };
}

export interface ReconcilePlan {
  inserts: SyncTask[];
  patches: { task: SyncTask; eventId: string }[];
  deletes: string[];
}

/** Pure diff between dated tasks and the Planner calendar's events. The
 *  Planner calendar is app-owned: events no task references get deleted. */
export function planReconcile(dated: SyncTask[], events: RawEvent[]): ReconcilePlan {
  const byEventId = new Map(events.map((e) => [e.id, e]));
  const inserts: SyncTask[] = [];
  const patches: { task: SyncTask; eventId: string }[] = [];
  const referenced = new Set<string>();
  for (const t of dated) {
    const ev = t.gcalEventId ? byEventId.get(t.gcalEventId) : undefined;
    if (!ev) {
      inserts.push(t);
      continue;
    }
    referenced.add(ev.id);
    if (ev.summary !== eventTitle(t) || ev.start?.date !== t.date) patches.push({ task: t, eventId: ev.id });
  }
  const deletes = events.filter((e) => !referenced.has(e.id)).map((e) => e.id);
  return { inserts, patches, deletes };
}

/* ---------- live sync entry points (called from the task API) ---------- */

/** Fire-and-forget: mirror one task's current state to the Planner calendar. */
export function queueTaskSync(userId: string, taskId: string): void {
  void syncTask(userId, taskId).catch((e) => console.error('[gcal] task sync failed:', e));
}

async function syncTask(userId: string, taskId: string): Promise<void> {
  const cfg = getGcalConfig(userId);
  if (!cfg?.pushCalendarId) return;
  const t = db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).get();
  if (!t) return; // row already deleted — queueTaskDelete handles that path
  if (!t.date) {
    // Moved back to the Inbox: remove the mirror event.
    if (t.gcalEventId) {
      await deleteEvent(cfg, cfg.pushCalendarId, t.gcalEventId);
      db.update(tasks).set({ gcalEventId: null }).where(eq(tasks.id, t.id)).run();
    }
    return;
  }
  const eventBody = taskToEventBody(t);
  if (t.gcalEventId) {
    try {
      await patchEvent(cfg, cfg.pushCalendarId, t.gcalEventId, eventBody);
      return;
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status !== 404 && status !== 410) throw e; // event vanished — fall through and recreate
    }
  }
  const eventId = await insertEvent(cfg, cfg.pushCalendarId, eventBody);
  db.update(tasks).set({ gcalEventId: eventId }).where(eq(tasks.id, t.id)).run();
}

/** Fire-and-forget removal of a deleted task's mirror event (id captured pre-delete). */
export function queueTaskDelete(userId: string, gcalEventId: string | null): void {
  if (!gcalEventId) return;
  const cfg = getGcalConfig(userId);
  if (!cfg?.pushCalendarId) return;
  void deleteEvent(cfg, cfg.pushCalendarId, gcalEventId).catch((e) => console.error('[gcal] event delete failed:', e));
}

/* ---------- reconcile sweep ---------- */

export async function reconcile(userId: string): Promise<void> {
  const cfg = getGcalConfig(userId);
  if (!cfg?.pushCalendarId) return;
  const dated = db.select().from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.date))).all() as SyncTask[];
  const events = await listAllEvents(cfg, cfg.pushCalendarId);
  const plan = planReconcile(dated, events);
  for (const t of plan.inserts) {
    const eventId = await insertEvent(cfg, cfg.pushCalendarId, taskToEventBody(t));
    db.update(tasks).set({ gcalEventId: eventId }).where(eq(tasks.id, t.id)).run();
  }
  for (const { task: t, eventId } of plan.patches) {
    await patchEvent(cfg, cfg.pushCalendarId, eventId, taskToEventBody(t));
  }
  for (const eventId of plan.deletes) {
    await deleteEvent(cfg, cfg.pushCalendarId, eventId);
  }
  if (plan.inserts.length || plan.patches.length || plan.deletes.length) {
    console.log(`[gcal] reconciled: +${plan.inserts.length} ~${plan.patches.length} -${plan.deletes.length}`);
  }
}

/** Reconcile every user's Planner calendar now, then hourly. */
export function startCalendarSync(): void {
  const run = () => {
    for (const u of db.select({ id: users.id }).from(users).all()) {
      reconcile(u.id).catch((e) => console.error('[gcal] reconcile failed:', e));
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix server test -- gcalSync`
Expected: PASS.

- [ ] **Step 6: Hook the task API + server boot**

In `server/src/api.ts`:

(a) import:

```ts
import { queueTaskDelete, queueTaskSync } from './gcalSync';
```

(b) `POST /tasks` — after `db.insert(tasks).values(row).run();`:

```ts
  queueTaskSync(uid(c), row.id);
```

(c) `PATCH /tasks/:id` — after the `if (res.changes === 0)` guard, before the return:

```ts
  queueTaskSync(uid(c), id);
```

(d) `DELETE /tasks/:id` — capture the event id before deleting; replace the handler body:

```ts
api.delete('/tasks/:id', (c) => {
  const id = c.req.param('id');
  const row = db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, uid(c)))).get();
  db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, uid(c)))).run();
  queueTaskDelete(uid(c), row?.gcalEventId ?? null);
  return c.json({ ok: true });
});
```

In `server/src/index.ts`, import and start the sweep after `bootstrap();`:

```ts
import { startCalendarSync } from './gcalSync';
```

```ts
migrate();
bootstrap();
startCalendarSync();
```

- [ ] **Step 7: Run all server tests + build**

Run: `npm --prefix server test && npm --prefix server run build`
Expected: PASS / build succeeds.

- [ ] **Step 8: Commit and push**

```bash
git add server/src/gcalSync.ts server/src/gcalSync.test.ts server/src/schema.ts server/src/db.ts server/src/api.ts server/src/index.ts
git commit -m "feat(server): mirror dated tasks to Google Planner calendar with hourly reconcile"
git push
```

---

## Task 9: Docs — service-account setup guide + README

**Files:**
- Create: `docs/gcal-setup.md`
- Modify: `README.md` (features list)

- [ ] **Step 1: Write `docs/gcal-setup.md`**

```markdown
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
```

- [ ] **Step 2: README feature bullet**

In `README.md`, add to the Features list (after the **Accounts** bullet):

```markdown
- **Google Calendar** — events show up in the Week planner and Today view; dated
  tasks mirror to a dedicated Planner calendar (service-account setup: see
  [docs/gcal-setup.md](docs/gcal-setup.md)).
```

- [ ] **Step 3: Commit and push**

```bash
git add docs/gcal-setup.md README.md
git commit -m "docs: Google Calendar service-account setup guide"
git push
```

---

## Task 10: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: server + client suites all PASS.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: server bundle + client static build succeed.

- [ ] **Step 3: Manual smoke (dev servers)**

Run `npm run dev` (server :8080, client :5173 — see `docs/` memory: ADMIN_EMAIL/ADMIN_PASSWORD must be set in `server/.env`). Verify:
- Settings shows the "Mon–Fri" toggle on groups and the Google Calendar card.
- Week board and Today render normally with the integration unconfigured (no errors, no chips).
- Progress page renders streaks without errors.

Stop the dev server afterwards.

- [ ] **Step 4: Report**

The calendar features can only be verified end-to-end after the user completes
`docs/gcal-setup.md` (Google Cloud project + key). Tell the user exactly that,
and list what they need to paste into Settings.
