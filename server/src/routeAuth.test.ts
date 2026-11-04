import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';

const dir = mkdtempSync(join(tmpdir(), 'timer-route-auth-'));
process.env.TIMER_DB = join(dir, 'test.db');
let api: typeof import('./api').api;
let sqlite: import('better-sqlite3').Database;
const json = (data: unknown, extra: Record<string, string> = {}) => ({
  method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(data),
});

beforeAll(async () => {
  const mod = await import('./db');
  sqlite = mod.sqlite;
  mod.migrate();
  ({ api } = await import('./api'));
  const { hashPassword } = await import('./auth');
  sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('owner', 'owner@test.dev', hashPassword('password-long'), 0);
  sqlite.prepare('INSERT INTO auth_sessions (id,user_id,created_at,expires_at) VALUES (?, ?, ?, ?)').run('owner-sid', 'owner', 0, Date.now() + 1e9);
  api.get('/future-private', (c) => c.json({ userId: c.get('userId') }));
});
afterAll(() => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

for (const mounted of [false, true]) {
  describe(mounted ? 'mounted API security' : 'direct API security', () => {
    const request = (path: string, init?: RequestInit) => mounted
      ? new Hono().route('/api', api).request(`/api${path}`, init)
      : api.request(path, init);
    it('protects future routes and exact public-path variants by default', async () => {
      for (const path of ['/future-private', '/health/nested', '/auth/me/nested', '/grind/register/nested', '/api/health']) {
        expect((await request(path)).status, path).toBe(401);
      }
      expect((await request('/health', { method: 'POST' })).status).toBe(401);
      expect((await request('/future-private', { headers: { cookie: 'sid=owner-sid' } })).status).toBe(200);
    });
    it('keeps exact public routes available', async () => {
      expect((await request('/health')).status).toBe(200);
      expect(await (await request('/auth/me')).json()).toEqual({ user: null });
      expect((await request('/auth/logout', { method: 'POST' })).status).toBe(200);
      expect((await request('/auth/login', json({ email: 'owner@test.dev', password: 'password-long' }))).status).toBe(200);
      expect((await request('/grind/login', json({ email: 'owner@test.dev', password: 'password-long' }))).status).toBe(200);
      expect((await request('/grind/register', json({ email: `new-${mounted}@test.dev`, password: 'password-long' }))).status).toBe(201);
    });
    it('prevents storage of all API responses, including errors and attachment bytes', async () => {
      sqlite.prepare('INSERT OR IGNORE INTO task_attachments (id,user_id,task_id,mime,data,created_at) VALUES (?, ?, ?, ?, ?, ?)').run('image', 'owner', 'task', 'image/png', Buffer.from([1]), 0);
      for (const path of ['/health', '/future-private', '/missing', '/attachments/image']) {
        const response = await request(path, { headers: { cookie: 'sid=owner-sid' } });
        expect(response.headers.get('cache-control'), path).toBe('no-store, private');
      }
      expect((await request('/future-private')).headers.get('cache-control')).toBe('no-store, private');
    });
    it('rejects another account header on private reads and writes', async () => {
      const headers = { cookie: 'sid=owner-sid', 'X-Timer-Account-Id': 'other' };
      expect((await request('/future-private', { headers })).status).toBe(403);
      expect((await request('/notes', json({ text: 'Do not save' }, headers))).status).toBe(403);
      expect(sqlite.prepare("SELECT id FROM notes WHERE text = 'Do not save'").all()).toEqual([]);
      expect((await request('/future-private', { headers: { ...headers, 'X-Timer-Account-Id': 'owner' } })).status).toBe(200);
      expect((await request('/auth/me', { headers })).status).toBe(200);
      expect((await request('/health', { headers })).status).toBe(200);
    });
    it('rejects a queued session for another account before any insert', async () => {
      const payload = { id: `wrong-${mounted}`, type: 'simple', plannedSeconds: 1, actualSeconds: 1, startedAt: 0, endedAt: 1 };
      const rejected = await request('/sessions', json(payload, { cookie: 'sid=owner-sid', 'X-Timer-Account-Id': 'other' }));
      expect(rejected.status).toBe(403);
      expect(sqlite.prepare('SELECT id FROM sessions WHERE id = ?').get(payload.id)).toBeUndefined();
      expect((await request('/sessions', json(payload, { cookie: 'sid=owner-sid', 'X-Timer-Account-Id': 'owner' }))).status).toBe(201);
      expect((await request('/sessions', json({ ...payload, id: `legacy-${mounted}` }, { cookie: 'sid=owner-sid' }))).status).toBe(201);
    });
  });
}
