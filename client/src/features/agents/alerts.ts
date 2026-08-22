import { useEffect, useRef } from 'react';
import { audio, requestNotificationPermission } from '../../engine/audio';
import { askingCount } from './sessionView';
import type { SessionCard } from './types';
import { clearTitleCount, setTitleCount } from '../../lib/docTitle';

const MUTE_KEY = 'cc_dash_muted';

/** Sessions that are blocked asking you a question (the alert-worthy ones). */
export function askingIds(cards: SessionCard[]): string[] {
  return cards.filter((c) => c.state === 'waiting' && c.subState === 'question').map((c) => c.sessionId);
}

/** Question sessions present now but not in the previous set. */
export function newlyAsking(prev: Set<string>, cards: SessionCard[]): string[] {
  return askingIds(cards).filter((id) => !prev.has(id));
}

export function loadMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function saveMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Fire a desktop notification + sound when a session *enters* the asking state (an
 * agent blocked on a question) — NOT on routine turn-ends/idle, which would be noise.
 * Primes on first render so a backlog of questions doesn't all alert on load. The tab
 * title is badged with the count of sessions asking. Mute silences sound + desktop
 * notification only; the badge always reflects reality.
 */
export function useWaitingAlerts(cards: SessionCard[], muted: boolean): void {
  const prevAsking = useRef<Set<string> | null>(null);

  useEffect(() => {
    const nowAsking = new Set(askingIds(cards));
    if (prevAsking.current !== null && !muted) {
      const fresh = [...nowAsking].filter((id) => !prevAsking.current!.has(id));
      if (fresh.length) {
        for (const id of fresh) {
          const c = cards.find((x) => x.sessionId === id);
          if (c) audio.notify(`${c.project} needs you`, c.question || 'Has a question for you', `cc-${c.sessionId}`);
        }
        audio.beep();
      }
    }
    prevAsking.current = nowAsking; // prime on first run; track thereafter

    setTitleCount('agents', askingCount(cards));
  }, [cards, muted]);

  // Drop this contributor when the alerts host unmounts (other badges stay).
  useEffect(() => () => clearTitleCount('agents'), []);
}

/** Ask for notification permission — call from a click handler (a user gesture). */
export function enableNotifications(): void {
  requestNotificationPermission();
}
