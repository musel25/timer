import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { RunProvider, useRun } from './RunContext';
import { initOfflineQueue } from '../../lib/offlineQueue';
import { saveRun } from './activeRunStore';
vi.mock('../../engine/audio');
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
const spec = { type: 'simple' as const, label: 'Private A timer', plannedSeconds: 3600, config: { totalSeconds: 3600, prepSeconds: 0 } };
function Start() { const { startRun } = useRun(); return <button onClick={() => startRun(spec)}>Start</button>; }
it('hides the first account run when another account signs in and retains its owner', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['me'], { user: { id: 'A', email: 'A@example.com' } });
  client.setQueryData(['settings'], {});
  initOfflineQueue(client, 'A');
  const view = render(<QueryClientProvider client={client}><RunProvider><Start /></RunProvider></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(screen.getByRole('button', { name: /Private A timer/ })).toBeDefined();
  act(() => { client.setQueryData(['me'], { user: { id: 'B', email: 'B@example.com' } }); initOfflineQueue(client, 'B'); });
  // Explicit rerender delivers the external query update synchronously here.
  view.rerender(<QueryClientProvider client={client}><RunProvider><Start /></RunProvider></QueryClientProvider>);
  expect(screen.queryByRole('button', { name: /Private A timer/ })).toBeNull();
  fireEvent.click(screen.getByTitle('Stop'));
  expect(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((key) => key.startsWith('timer_pending_sessions:owned:A:'))!)!).label).toBe('Private A timer');
  expect(Object.keys(localStorage).find((key) => key.startsWith('timer_pending_sessions:owned:B:')) ?? null).toBeNull();
  view.unmount(); client.clear();
});
it('does not assign a resumed legacy run to the current account', () => {
  saveRun('foreground', { spec, startedAtEpoch: Date.now(), status: 'paused', elapsedMs: 0, snapshotEpoch: Date.now() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['me'], { user: { id: 'B', email: 'B@example.com' } });
  client.setQueryData(['settings'], {});
  initOfflineQueue(client, 'B');
  const view = render(<QueryClientProvider client={client}><RunProvider><Start /></RunProvider></QueryClientProvider>);
  expect(screen.queryByRole('button', { name: /Private A timer/ })).toBeNull();
  fireEvent.click(screen.getByTitle('Stop'));
  expect(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((key) => key.startsWith('timer_pending_sessions:unowned:'))!)!).label).toBe('Private A timer');
  view.unmount(); client.clear();
});
