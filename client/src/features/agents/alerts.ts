import { useEffect, useRef } from 'react';
import { audio, requestNotificationPermission } from '../../engine/audio';
import { waitingCount } from './sessionView';
import type { SessionCard } from './types';

const MUTE_KEY = 'cc_dash_muted';
const BASE_TITLE = 'Timer';

/** Session ids that are waiting now but were not in the previous waiting set. */
export function newlyWaiting(prev: Set<string>, cards: SessionCard[]): string[] {
  return cards.filter((c) => c.state === 'waiting' && !prev.has(c.sessionId)).map((c) => c.sessionId);
}

export function loadMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function saveMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Fire a desktop notification + sound when a session *enters* the waiting state, and
 * keep the browser tab title badged with the waiting count. Honors the mute flag for
 * the noisy parts (notification + sound); the tab badge always reflects reality.
 */
export function useWaitingAlerts(cards: SessionCard[], muted: boolean): void {
  const prevWaiting = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh = newlyWaiting(prevWaiting.current, cards);
    if (!muted && fresh.length) {
      for (const id of fresh) {
        const c = cards.find((x) => x.sessionId === id);
        if (!c) continue;
        const body = c.subState === 'question'
          ? (c.question || 'Has a question for you')
          : 'Waiting for your input';
        audio.notify(`${c.project} needs you`, body, `cc-${c.sessionId}`);
      }
      audio.beep();
    }
    prevWaiting.current = new Set(cards.filter((c) => c.state === 'waiting').map((c) => c.sessionId));

    const n = waitingCount(cards);
    document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
  }, [cards, muted]);

  // Restore the title when the alerts host unmounts.
  useEffect(() => () => { document.title = BASE_TITLE; }, []);
}

/** Ask for notification permission — call from a click handler (a user gesture). */
export function enableNotifications(): void {
  requestNotificationPermission();
}
