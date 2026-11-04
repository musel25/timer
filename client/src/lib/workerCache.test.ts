import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => vi.unstubAllGlobals());
it('deletes the old shared API cache on activation and keeps static caches', async () => {
  let activate!: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;
  const remaining = new Set(['api', 'workbox-precache-v2-static']);
  vi.stubGlobal('self', { addEventListener: (name: string, listener: typeof activate) => { if (name === 'activate') activate = listener; } });
  vi.stubGlobal('caches', { delete: async (name: string) => remaining.delete(name) });
  const path = '../../public/purge-api-cache.js';
  await import(/* @vite-ignore */ path);
  let work!: Promise<unknown>;
  activate({ waitUntil: (promise) => { work = promise; } });
  await work;
  expect([...remaining]).toEqual(['workbox-precache-v2-static']);
});
