import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Session } from './types';

const KEY = 'timer_pending_sessions';
let qc: QueryClient | null = null;

function read(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}
function write(list: Session[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function initOfflineQueue(client: QueryClient): void {
  qc = client;
  window.addEventListener('online', () => void flush());
  void flush();
}

/** Record a finished run. Works offline: queued locally, flushed when possible. */
export async function logSession(s: Session): Promise<void> {
  const q = read();
  q.push(s);
  write(q);
  // Optimistic: show it immediately in any loaded sessions list.
  qc?.setQueryData<Session[]>(['sessions'], (old = []) => [s, ...old]);
  await flush();
}

export async function flush(): Promise<void> {
  const q = read();
  if (q.length === 0) return;
  try {
    await api.post('/sessions', q);
    write([]);
    qc?.invalidateQueries({ queryKey: ['sessions'] });
  } catch {
    // Offline or server down — keep the queue for the next attempt.
  }
}

export function pendingCount(): number {
  return read().length;
}
