import { afterEach, expect, it, vi } from 'vitest';
import { api, setRequestAccount } from './api';
afterEach(() => { setRequestAccount(null); vi.unstubAllGlobals(); });
it('uses a unique GET URL for each request to bypass old account-shared worker caches', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  await api.get('/settings?existing=yes');
  fetcher.mockResolvedValue(new Response('{}'));
  await api.get('/settings?existing=yes');
  const urls = fetcher.mock.calls.map(([url]) => new URL(url, location.origin));
  expect(urls[0].searchParams.get('existing')).toBe('yes');
  expect(urls[0].searchParams.get('_timer_request')).toBeTruthy();
  expect(urls[0].href).not.toBe(urls[1].href);
  expect(fetcher.mock.calls[0][1].cache).toBe('no-store');
});
it('rejects old account responses even if fetch ignores request cancellation', async () => {
  const { cancelAccountRequests } = await import('./api');
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((yes) => { resolve = yes; })));
  const request = api.get('/notes');
  cancelAccountRequests();
  resolve(new Response('[{"text":"private A"}]'));
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
});

it('binds private JSON requests to the discovered account while leaving account discovery public', async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({})));
  vi.stubGlobal('fetch', fetcher);
  setRequestAccount('A');
  await api.patch('/tasks/task', { done: true });
  await api.get('/notes');
  await api.get('/auth/me');
  await api.post('/auth/login', { email: 'B', password: 'password' });
  expect(fetcher.mock.calls[0][1].headers['X-Timer-Account-Id']).toBe('A');
  expect(fetcher.mock.calls[1][1].headers['X-Timer-Account-Id']).toBe('A');
  expect(fetcher.mock.calls[2][1].headers['X-Timer-Account-Id']).toBeUndefined();
  expect(fetcher.mock.calls[3][1].headers['X-Timer-Account-Id']).toBeUndefined();
});
