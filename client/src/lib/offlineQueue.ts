import type { QueryClient } from '@tanstack/react-query';
import { api, setRequestAccount } from './api';
import type { Session } from './types';

const LEGACY_KEY = 'timer_pending_sessions';
let qc: QueryClient | null = null;
let accountId: string | null = null;
let generation = 0;
let running: Promise<void> | null = null;
let controller: AbortController | null = null;
let listening = false;
const prefix = (owner: string | null) => owner === null
  ? `${LEGACY_KEY}:unowned:` : `${LEGACY_KEY}:owned:${encodeURIComponent(owner)}:`;
const sessionKey = (owner: string | null, id: string) => `${prefix(owner)}${encodeURIComponent(id)}`;

function read(owner: string | null): Session[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix(owner))) keys.push(key);
  }
  return keys.flatMap((key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Session | null;
      return value && typeof value.id === 'string' ? [value] : [];
    } catch { return []; }
  });
}

/** No account means discovery is incomplete or the user has signed out. */
export function initOfflineQueue(client: QueryClient, owner: string | null = null): void {
  qc = client;
  if (!listening) {
    window.addEventListener('online', () => void flush());
    listening = true;
  }
  if (accountId !== owner) {
    accountId = owner;
    setRequestAccount(owner);
    generation++;
    controller?.abort();
  }
  void flush();
}

export function offlineAccountId(): string | null {
  return accountId;
}

/** Keep the run's original owner even if it ends after an account change. */
export async function logSession(s: Session, owner: string | null = accountId): Promise<void> {
  localStorage.setItem(sessionKey(owner, s.id), JSON.stringify(s));
  if (owner !== null && owner === accountId) {
    qc?.setQueryData<Session[]>(['sessions'], (old = []) => [s, ...old]);
    await flush();
  }
}

export function flush(): Promise<void> {
  if (running) return running;
  if (accountId === null || read(accountId).length === 0) return Promise.resolve();
  const owner = accountId;
  const started = generation;
  controller = new AbortController();
  const signal = controller.signal;
  running = (async () => {
    while (accountId === owner && generation === started) {
      const batch = read(owner);
      if (!batch.length) return;
      try {
        const result = await api.post<{ ids: string[] }>('/sessions', batch, {
          signal, headers: { 'X-Timer-Account-Id': owner },
        });
        // An aborted upload can still reach the server. Keep it for idempotent
        // retry, and never invalidate the next account's cache.
        if (generation !== started || signal.aborted) return;
        const acknowledged = new Set(result.ids);
        if (!batch.some((s) => acknowledged.has(s.id))) return;
        // Each immutable session has its own key. Another tab can append
        // between these deletes without its session being overwritten.
        for (const s of batch) {
          if (acknowledged.has(s.id)) localStorage.removeItem(sessionKey(owner, s.id));
        }
        void qc?.invalidateQueries({ queryKey: ['sessions'] });
      } catch {
        return; // Keep all unacknowledged rows for the next attempt.
      }
    }
  })().finally(() => {
    running = null;
    controller = null;
    if (generation !== started) void flush();
  });
  return running;
}

export function pendingCount(): number {
  return accountId === null ? 0 : read(accountId).length;
}
