import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'timer-health-'));
process.env.TIMER_DB = join(directory, 'test.db');
let api: typeof import('./api').api;
let sqlite: typeof import('./db').sqlite;
beforeAll(async () => {
  ({ api } = await import('./api'));
  ({ sqlite } = await import('./db'));
});
afterAll(() => {
  vi.unstubAllEnvs();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});
it('reports the running image revision without requiring login', async () => {
  vi.stubEnv('APP_REVISION', 'a'.repeat(40));
  const response = await api.request('/health');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, revision: 'a'.repeat(40) });
});
