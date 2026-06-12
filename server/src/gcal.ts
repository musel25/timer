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
