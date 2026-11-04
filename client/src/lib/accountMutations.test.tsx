import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useReorderTasks, useToggleTask } from './hooks';
import { clearAccountState } from './accountState';
import { initOfflineQueue } from './offlineQueue';
import type { Task } from './types';
const task: Task = { id: 'A-task', title: 'Private A', notes: null, date: null, done: false, completedAt: null, hiddenOn: null, archivedAt: null, sortOrder: 0, createdAt: 1 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
for (const nextOwner of ['B', 'A']) {
for (const operation of ['toggle', 'reorder'] as const) {
  it(`does not restore or invalidate A tasks when a delayed ${operation} fails after an A-to-B-to-${nextOwner} change`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    initOfflineQueue(client, 'A');
    client.setQueryData(['tasks'], [task, { ...task, id: 'A-second', sortOrder: 1 }]);
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((yes) => { resolve = yes; }));
    vi.stubGlobal('fetch', fetcher);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({ toggle: useToggleTask(), reorder: useReorderTasks() }), { wrapper });
    act(() => {
      if (operation === 'toggle') result.current.toggle.mutate({ id: 'A-task', done: true });
      else result.current.reorder.mutate({ date: null, ids: ['A-second', 'A-task'] });
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => { await clearAccountState(client); initOfflineQueue(client, 'B'); if (nextOwner === 'A') initOfflineQueue(client, 'A'); });
    const bTasks = [{ ...task, id: 'B-task', title: 'Private B' }];
    client.setQueryData(['tasks'], bTasks);
    await act(async () => resolve(Response.json({ ok: true })));
    await waitFor(() => expect(result.current[operation].isError).toBe(true));
    expect(client.getQueryData(['tasks'])).toEqual(bTasks);
    expect(client.getQueryState(['tasks'])?.isInvalidated).toBe(false);
    client.clear();
  });
}
}
for (const operation of ['toggle', 'reorder'] as const) {
  it(`does not start a ${operation} when the account changes while its optimistic preparation waits`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    initOfflineQueue(client, 'A');
    client.setQueryData(['tasks'], [task]);
    let release!: () => void;
    const gate = new Promise<void>((yes) => { release = yes; });
    const cancel = vi.spyOn(client, 'cancelQueries').mockReturnValueOnce(gate);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({ toggle: useToggleTask(), reorder: useReorderTasks() }), { wrapper });
    act(() => { if (operation === 'toggle') result.current.toggle.mutate({ id: 'A-task', done: true }); else result.current.reorder.mutate({ date: null, ids: ['A-task'] }); });
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    const { cancelAccountRequests } = await import('./api');
    cancelAccountRequests(); initOfflineQueue(client, 'B');
    const bTasks = [{ ...task, id: 'A-task', title: 'Private B' }];
    client.setQueryData(['tasks'], bTasks);
    await act(async () => release());
    await waitFor(() => expect(result.current[operation].isPending).toBe(false));
    expect(fetcher).not.toHaveBeenCalled();
    expect(client.getQueryData(['tasks'])).toEqual(bTasks);
    expect(client.getQueryState(['tasks'])?.isInvalidated).toBe(false);
    client.clear();
  });
}
