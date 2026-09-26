import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDeleteSession, useLogSession, useSaveTask, useSessions, useTasks } from './hooks';
import type { Task, Session } from './types';

const task: Task = { id: 'task', title: 'Before', notes: null, date: null, done: false, completedAt: null, hiddenOn: null, archivedAt: null, sortOrder: 1, createdAt: 1, attachmentCount: 2 };
const session: Session = { id: 'old', habitId: 'read', timerId: null, label: null, type: 'simple', plannedSeconds: 60, actualSeconds: 60, completed: true, startedAt: 1, endedAt: 60001, note: null, createdAt: 1 };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  client.setQueryData(['tasks'], [task]);
  client.setQueryData(['sessions'], [session]);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('save feedback without a second network round trip', () => {
  it('updates an edited task and finishes saving even when subsequent reads would stall', async () => {
    const { client, wrapper } = setup();
    const write = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((_url, options) => options?.method === 'PATCH' ? write.promise : new Promise(() => {})));
    const { result } = renderHook(() => ({ save: useSaveTask(), tasks: useTasks() }), { wrapper });
    act(() => result.current.save.mutate({ id: 'task', title: 'After' }));
    await waitFor(() => expect(result.current.save.isPending).toBe(true));
    expect(client.getQueryData<Task[]>(['tasks'])?.[0].title).toBe('Before');
    const { attachmentCount: _, ...saved } = task;
    await act(async () => write.resolve(Response.json({ ...saved, title: 'After' })));
    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    expect(result.current.tasks.data?.[0]).toMatchObject({ title: 'After', attachmentCount: 2 });
  });

  it('keeps both newly created tasks when responses arrive out of order', async () => {
    const { client, wrapper } = setup();
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((_url, options) => JSON.parse(options.body).title === 'First' ? first.promise : second.promise));
    const { result } = renderHook(() => useSaveTask(), { wrapper });
    act(() => { result.current.mutate({ title: 'First' }); result.current.mutate({ title: 'Second' }); });
    await act(async () => second.resolve(Response.json({ ...task, id: 'second', title: 'Second' })));
    await act(async () => first.resolve(Response.json({ ...task, id: 'first', title: 'First' })));
    await waitFor(() => expect(client.getQueryData<Task[]>(['tasks'])?.map((t) => t.id).sort()).toEqual(['first', 'second', 'task']));
  });

  it('leaves cached tasks unchanged on a failed save', async () => {
    const { client, wrapper } = setup();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'failed' }, { status: 500 })));
    const { result } = renderHook(() => useSaveTask(), { wrapper });
    act(() => result.current.mutate({ id: 'task', title: 'After' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(['tasks'])).toEqual([task]);
  });

  it('shows a confirmed habit log without refetching session history', async () => {
    const { wrapper } = setup();
    vi.stubGlobal('fetch', vi.fn((_url, options) => options?.method === 'POST'
      ? Promise.resolve(Response.json({ inserted: 1, ids: ['new'] }, { status: 201 })) : new Promise(() => {})));
    const { result } = renderHook(() => ({ log: useLogSession(), sessions: useSessions() }), { wrapper });
    act(() => result.current.log.mutate({ habitId: 'read', minutes: 10, note: '  Chapter 2  ', endedAt: 1_000_000 }));
    await waitFor(() => expect(result.current.log.isSuccess).toBe(true));
    expect(result.current.sessions.data).toEqual([
      expect.objectContaining({ id: 'new', habitId: 'read', actualSeconds: 600, startedAt: 400_000, endedAt: 1_000_000, note: 'Chapter 2' }), session,
    ]);
  });

  it('removes only the confirmed deleted log without waiting for a refetch', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['sessions'], [session, { ...session, id: 'keep' }]);
    vi.stubGlobal('fetch', vi.fn((_url, options) => options?.method === 'DELETE'
      ? Promise.resolve(Response.json({ ok: true })) : new Promise(() => {})));
    const { result } = renderHook(() => ({ remove: useDeleteSession(), sessions: useSessions() }), { wrapper });
    act(() => result.current.remove.mutate('old'));
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    expect(result.current.sessions.data?.map((s) => s.id)).toEqual(['keep']);
  });
});

// Exercise the real dashboard and hooks with only the network delayed.
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../features/dashboard/Dashboard';
import type { Habit } from './types';
const habit: Habit = { id: 'read', name: 'Read', kind: 'time', durations: [10], defaultDurationMin: 10, dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null, emoji: null, note: null, groupId: null, sortOrder: 0, archived: false, hiddenOn: null, createdAt: 0 };
function seedDashboard(client: QueryClient) {
  client.setQueryData(['habits'], [habit]);
  for (const key of ['groups', 'rest-days', 'vacation-days']) client.setQueryData([key], []);
  client.setQueryData(['settings'], { weekStart: 1 });
}
it('acknowledges a habit click immediately and prevents duplicates while saving', async () => {
  const { client, wrapper } = setup();
  seedDashboard(client);
  const write = deferred<Response>();
  const fetch = vi.fn(() => write.promise);
  vi.stubGlobal('fetch', fetch);
  render(<MemoryRouter><Dashboard /></MemoryRouter>, { wrapper });
  fireEvent.click(screen.getByRole('button', { name: 'Log 20 minutes' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saving'));
  const button = screen.getByRole('button', { name: 'Log 20 minutes' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => write.resolve(Response.json({ inserted: 1, ids: ['new'] })));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(screen.getByText('1 of 1 daily habits complete')).toBeDefined();
});
it('keeps entry text and reports a failed habit save', async () => {
  const { client, wrapper } = setup();
  seedDashboard(client);
  client.setQueryData(['habits'], [{ ...habit, kind: 'check' }]);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'offline' }, { status: 503 })));
  render(<MemoryRouter><Dashboard /></MemoryRouter>, { wrapper });
  fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Keep this entry' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Keep this entry');
  expect(client.getQueryData(['sessions'])).toEqual([session]);
});
it('restarts a background reconciliation canceled by a save', async () => {
  const { client, wrapper } = setup();
  let reads = 0;
  const staleRead = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn((_url, options) => {
    if (options?.method === 'PATCH') return Promise.resolve(Response.json({ ...task, title: 'After', attachmentCount: undefined }));
    reads++;
    return reads === 1 ? staleRead.promise : Promise.resolve(Response.json([{ ...task, title: 'After', attachmentCount: 3 }]));
  }));
  const { result } = renderHook(() => ({ save: useSaveTask(), tasks: useTasks() }), { wrapper });
  act(() => { void client.invalidateQueries({ queryKey: ['tasks'] }); });
  await waitFor(() => expect(reads).toBe(1));
  act(() => result.current.save.mutate({ id: 'task', title: 'After' }));
  await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.tasks.data?.[0].attachmentCount).toBe(3));
});
