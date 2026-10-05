import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'grind-api-'));
process.env.TIMER_DB = join(dir, 'test.db');
let api: typeof import('./api').api;
let sqlite: typeof import('./db').sqlite;
const send = (cookie: string, data: unknown) => ({
  method: 'PUT',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(data),
});
const state = {
  version: 1,
  revision: 0,
  settings: {},
  progress: {},
  history: [],
};
beforeAll(async () => {
  const db = await import('./db');
  sqlite = db.sqlite;
  db.migrate();
  db.migrate();
  ({ api } = await import('./api'));
  for (const id of ['alice', 'bob']) {
    sqlite
      .prepare('INSERT INTO users VALUES (?, ?, ?, ?)')
      .run(id, `${id}@example.com`, 'x', Date.now());
    sqlite
      .prepare('INSERT INTO auth_sessions VALUES (?, ?, ?, ?, ?)')
      .run(id, id, Date.now(), Date.now() + 1e8, null);
  }
});
afterAll(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});
it('requires login for every progress operation', async () => {
  expect((await api.request('/grind/state')).status).toBe(401);
  expect((await api.request('/grind/state', send('', {}))).status).toBe(401);
});
it('saves per account, rejects stale writes and makes retrying an acknowledged write safe', async () => {
  const data = {
    accountId: 'alice',
    baseVersion: 0,
    mutationId: 'mutation-1',
    state,
  };
  const saved = await api.request('/grind/state', send('sid=alice', data));
  expect(saved.status).toBe(200);
  expect((await saved.json()).version).toBe(1);
  expect(
    (await (await api.request('/grind/state', send('sid=alice', data))).json())
      .version,
  ).toBe(1);
  const bob = await (
    await api.request('/grind/state', { headers: { cookie: 'sid=bob' } })
  ).json();
  expect(bob.state).toBeNull();
  expect(
    (await api.request('/grind/state', send('sid=bob', data))).status,
  ).toBe(403);
  expect(
    (
      await api.request(
        '/grind/state',
        send('sid=alice', { ...data, mutationId: 'stale' }),
      )
    ).status,
  ).toBe(409);
  const read = await api.request('/grind/state', {
    headers: { cookie: 'sid=alice' },
  });
  expect(read.headers.get('cache-control')).toContain('no-store');
  expect((await read.json()).state).toEqual(state);
});
it('rejects cross-origin writes and malformed progress', async () => {
  const req = send('sid=alice', {
    accountId: 'alice',
    baseVersion: 1,
    mutationId: 'invalid',
    state: {},
  });
  expect((await api.request('/grind/state', req)).status).toBe(400);
  expect(
    (
      await api.request('/grind/state', {
        ...req,
        headers: { ...req.headers, origin: 'https://evil.example' },
      })
    ).status,
  ).toBe(403);
});
it('creates a separate account and prevents duplicate registration', async () => {
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'New@Example.com',
      password: 'test-password-123',
    }),
  };
  const res = await api.request('/grind/register', req);
  expect(res.status).toBe(201);
  expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  expect((await res.json()).user.email).toBe('new@example.com');
  expect((await api.request('/grind/register', req)).status).toBe(409);
});
