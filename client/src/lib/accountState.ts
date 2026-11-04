import type { QueryClient } from '@tanstack/react-query';
import { cancelAccountRequests } from './api';
import { initOfflineQueue } from './offlineQueue';

const AUTH_CHANGE_KEY = 'timer_auth_change';

/** Stop private work before changing the shared authentication cookie. */
export async function clearAccountState(client: QueryClient): Promise<void> {
  cancelAccountRequests();
  initOfflineQueue(client, null);
  await client.cancelQueries();
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
  client.setQueryData(['me'], { user: null });
}

export function announceAccountChange(): void {
  localStorage.setItem(AUTH_CHANGE_KEY, crypto.randomUUID());
}

export function watchAccountChanges(client: QueryClient): void {
  window.addEventListener('storage', (event) => {
    if (event.key !== AUTH_CHANGE_KEY) return;
    void clearAccountState(client).then(() => client.invalidateQueries({ queryKey: ['me'] }));
  });
}
