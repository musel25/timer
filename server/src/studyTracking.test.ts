import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'timer-study-'));
process.env.TIMER_DB = join(dir, 'test.db');
let sqlite: import('better-sqlite3').Database;
let api: typeof import('./api').api;
const timer = { id: 'study-1', type: 'interval', plannedSeconds: 1800, actualSeconds: 1800,
  completed: true, startedAt: 10, endedAt: 1800010, focusSeconds: 1500, completedSets: 2 };
const request = (data: unknown) => api.request('/sessions', {
  method: 'POST', headers: { 'content-type': 'application/json', cookie: 'sid=study-sid' }, body: JSON.stringify(data),
});

beforeAll(async () => {
  const mod = await import('./db'); sqlite = mod.sqlite; mod.migrate();
  ({ api } = await import('./api'));
  sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('student', 'student@test.dev', 'hash', 0);
  sqlite.prepare('INSERT INTO auth_sessions (id,user_id,created_at,expires_at) VALUES (?, ?, ?, ?)').run('study-sid', 'student', 0, Date.now() + 1e9);
});
afterAll(() => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

it('stores focus seconds and completed sets on a timer session', async () => {
  expect((await request(timer)).status).toBe(201);
  expect(sqlite.prepare('SELECT user_id, focus_seconds, completed_sets FROM sessions WHERE id = ?').get(timer.id))
    .toEqual({ user_id: 'student', focus_seconds: 1500, completed_sets: 2 });
});

it('rejects negative tracking values', async () => {
  expect((await request({ ...timer, id: 'bad-focus', focusSeconds: -1 })).status).toBe(400);
  expect((await request({ ...timer, id: 'bad-sets', completedSets: -1 })).status).toBe(400);
  expect(sqlite.prepare("SELECT id FROM sessions WHERE id LIKE 'bad-%'").all()).toEqual([]);
});
