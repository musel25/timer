import type { Thread } from '../../lib/types';
import { isReady } from './nextUp';

/** How far past its wakeAt a thread may be and still be worth notifying about.
 *  The /api service-worker cache is NetworkFirst, so a resumed session can hand
 *  us rows that came due hours ago; firing for those is pure noise. */
export const NOTIFY_STALE_MS = 10 * 60 * 1000;

const STORAGE_KEY = 'now.notified';

export interface DueInput {
  threads: Thread[];
  now: number;
  /** Ids already notified about, so each thread pokes you exactly once. */
  notified: string[];
  muted?: boolean;
}

export function dueThreads({ threads, now, notified, muted = false }: DueInput): Thread[] {
  if (muted) return [];
  const seen = new Set(notified);
  return threads.filter(
    (t) => isReady(t, now) && !seen.has(t.id) && now - (t.wakeAt ?? 0) <= NOTIFY_STALE_MS,
  );
}

export function loadNotified(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveNotified(ids: string[]): void {
  try {
    // Keep it bounded; only recent ids matter for dedupe.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-100)));
  } catch {
    /* private mode / quota — dedupe degrades to per-session, which is fine */
  }
}

/** Ask for permission at the moment a wake-at is set — never on page load, where
 *  it gets reflexively denied and then cannot be asked again. */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function fireThreadNotification(t: Thread): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const body = t.nextStep || (t.waitingOn ? `Waiting on ${t.waitingOn}` : 'Ready to pick up');
  const opts: NotificationOptions = { body, tag: `thread-${t.id}`, icon: '/pwa-192.png' };
  // Prefer the service worker so an installed PWA behaves the same as a tab.
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification(t.title, opts))
    .catch(() => { new Notification(t.title, opts); });
}
