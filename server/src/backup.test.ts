import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'timer-backup-'));
process.env.TIMER_DB = join(dir, 'test.db');
let sqlite: import('better-sqlite3').Database;
let api: typeof import('./api').api;
const post = (data: unknown, account = 'a') => api.request('/import', {
  method: 'POST', headers: { 'content-type': 'application/json', cookie: `sid=${account}` }, body: JSON.stringify(data),
});
beforeAll(async () => {
  const mod = await import('./db'); sqlite = mod.sqlite; mod.migrate();
  ({ api } = await import('./api'));
  for (const account of ['a', 'b']) {
    sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(account, `${account}@test.dev`, 'hash', 0);
    sqlite.prepare('INSERT INTO auth_sessions (id,user_id,created_at,expires_at) VALUES (?, ?, ?, ?)').run(account, account, 0, Date.now() + 1e9);
  }
});
afterAll(() => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

it('exports and restores rest and vacation dates for the current account', async () => {
  for (const table of ['rest_days', 'vacation_days']) {
    sqlite.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`).run(table, 'a', '2026-11-04', 3);
    sqlite.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`).run(`${table}-other`, 'b', '2026-11-05', 4);
  }
  const dump = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as { restDays: unknown[]; vacationDays: unknown[] };
  expect(dump.restDays).toEqual([{ id: 'rest_days', userId: 'a', date: '2026-11-04', createdAt: 3 }]);
  expect(dump.vacationDays).toEqual([{ id: 'vacation_days', userId: 'a', date: '2026-11-04', createdAt: 3 }]);
  for (const table of ['rest_days', 'vacation_days']) sqlite.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run('a');
  expect((await post(dump)).status).toBe(200);
  expect((await post(dump)).status).toBe(200);
  for (const table of ['rest_days', 'vacation_days']) {
    expect(sqlite.prepare(`SELECT user_id, date FROM ${table} ORDER BY user_id`).all()).toEqual([
      { user_id: 'a', date: '2026-11-04' }, { user_id: 'b', date: '2026-11-05' },
    ]);
  }
});
it('accepts legacy backups without optional collections and fills old defaults', async () => {
  expect((await post({ habits: [{ id: 'legacy-habit', userId: 'source', name: 'Legacy', durations: [5], createdAt: 0 }] })).status).toBe(200);
  expect(sqlite.prepare('SELECT user_id, cadence FROM habits WHERE id = ?').get('legacy-habit')).toEqual({ user_id: 'a', cadence: 'daily' });
});
it('preserves study totals in exported and imported timer sessions', async () => {
  const row = { id: 'study-backup', type: 'simple', plannedSeconds: 600, actualSeconds: 600,
    completed: true, startedAt: 100, endedAt: 600100, focusSeconds: 600, completedSets: 1, createdAt: 100 };
  expect((await post({ sessions: [row] })).status).toBe(200);
  const dump = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as { sessions: Array<{ id: string; focusSeconds: number | null; completedSets: number | null }> };
  expect(dump.sessions.find((session) => session.id === row.id)).toMatchObject({ focusSeconds: 600, completedSets: 1 });
  sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
  expect((await post(dump)).status).toBe(200);
  expect(sqlite.prepare('SELECT focus_seconds, completed_sets FROM sessions WHERE id = ?').get(row.id))
    .toEqual({ focus_seconds: 600, completed_sets: 1 });
});
it('rejects invalid collections before writing any data', async () => {
  const response = await post({ restDays: [{ id: 'should-not-insert', date: '2026-11-06', createdAt: 0 }], notes: [{ id: 'bad', text: 42 }] });
  expect(response.status).toBe(400);
  expect(sqlite.prepare('SELECT id FROM rest_days WHERE id = ?').get('should-not-insert')).toBeUndefined();
  expect((await post({ restDays: 'invalid' })).status).toBe(400);
});
it('reassigns imported owners and never changes another account on ID conflict', async () => {
  expect((await post({ restDays: [{ id: 'owner-reassigned', userId: 'b', date: '2026-11-07', createdAt: 0 }] })).status).toBe(200);
  expect(sqlite.prepare('SELECT user_id FROM rest_days WHERE id = ?').get('owner-reassigned')).toEqual({ user_id: 'a' });
  expect((await post({ restDays: [{ id: 'rest_days-other', userId: 'b', date: '2026-11-08', createdAt: 0 }] })).status).toBe(200);
  expect(sqlite.prepare('SELECT user_id, date FROM rest_days WHERE id = ?').get('rest_days-other')).toEqual({ user_id: 'b', date: '2026-11-05' });
});
it('restores JSON timer configurations accepted by the existing API', async () => {
  const payload = { timers: [{ id: 'json-config', name: 'Timer', type: 'simple', config: [1, { enabled: true }], createdAt: 0, updatedAt: 0 }] };
  expect((await post(payload)).status).toBe(200);
  expect(sqlite.prepare('SELECT config FROM timers WHERE id = ?').get('json-config')).toEqual({ config: '[1,{"enabled":true}]' });
});

it('rolls back all collections when SQLite rejects a later insert', async () => {
  sqlite.exec("CREATE TRIGGER reject_vacation BEFORE INSERT ON vacation_days WHEN NEW.id = 'fail-vacation' BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await post({
      restDays: [{ id: 'rolled-back', date: '2026-11-09', createdAt: 0 }],
      vacationDays: [{ id: 'fail-vacation', date: '2026-11-09', createdAt: 0 }],
    });
    expect(response.status).toBe(500);
    expect(sqlite.prepare("SELECT id FROM rest_days WHERE id='rolled-back'").get()).toBeUndefined();
  } finally {
    errors.mockRestore();
    sqlite.exec('DROP TRIGGER reject_vacation');
  }
});

it.each([
  { id: 'zero-goal', dailyGoalMin: 0 },
  { id: 'negative-goal', dailyGoalMin: -5 },
  { id: 'empty-durations', durations: [] },
  { id: 'legacy-enums', kind: 'old-kind', cadence: 'old-cadence', timerType: 'old-timer' },
])('restores stored legacy habit values: $id', async (legacy) => {
  const { db } = await import('./db');
  const { habits } = await import('./schema');
  const row = { userId: 'a', name: 'Legacy', durations: [5], createdAt: 0, ...legacy };
  db.insert(habits).values(row).run();
  const dump = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as { habits: { id: string }[] };
  const stored = dump.habits.find((habit) => habit.id === legacy.id);
  sqlite.prepare('DELETE FROM habits WHERE id = ?').run(legacy.id);
  expect((await post({ habits: [stored] })).status).toBe(200);
  const restored = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as { habits: { id: string }[] };
  expect(restored.habits.find((habit) => habit.id === legacy.id)).toEqual(stored);
});

it('restores stored legacy enum strings and null JSON timer configuration', async () => {
  // SQLite stores JSON null as the TEXT 'null', distinct from SQL NULL.
  sqlite.prepare("INSERT INTO timers (id,user_id,name,type,config,created_at,updated_at) VALUES ('null-config','a','','legacy-type','null',0,0)").run();
  const dump = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as { timers: { id: string }[] };
  const stored = dump.timers.find((timer) => timer.id === 'null-config');
  sqlite.prepare('DELETE FROM timers WHERE id = ?').run('null-config');
  expect((await post({ timers: [stored] })).status).toBe(200);
  expect(sqlite.prepare('SELECT name,type,config FROM timers WHERE id=?').get('null-config')).toEqual({ name: '', type: 'legacy-type', config: 'null' });
});

it.each([
  { habits: [{ id: 'bad-name', name: 42, durations: [], createdAt: 0 }] },
  { habits: [{ id: 'bad-goal', name: 'Bad', durations: [], dailyGoalMin: 'zero', createdAt: 0 }] },
  { sessions: [{ id: 'bad-seconds', type: 'legacy', plannedSeconds: 'zero', actualSeconds: 0, startedAt: 0, endedAt: 1, createdAt: 0 }] },
  { notes: [{ id: 'bad-text', text: 42, tags: [], createdAt: 0, updatedAt: 0 }] },
])('rejects malformed field types in legacy imports %#', async (payload) => {
  expect((await post(payload)).status).toBe(400);
});

it('round-trips legacy storage values across every remaining collection', async () => {
  sqlite.exec(`
    INSERT INTO habit_groups (id,user_id,name,sort_order) VALUES ('legacy-groups','a','',-3);
    INSERT INTO sessions (id,user_id,type,planned_seconds,actual_seconds,started_at,ended_at,category,created_at)
      VALUES ('legacy-sessions','a','old-type',-2,0,0.5,-1,'old-category',0);
    INSERT INTO tasks (id,user_id,title,date,hidden_on,archived_at,created_at)
      VALUES ('legacy-tasks','a','','old-date','old-hidden',-1,0);
    INSERT INTO notes (id,user_id,text,tags,created_at,updated_at)
      VALUES ('legacy-notes','a','','[]',0,-1);
    INSERT INTO desktops (id,user_id,title,tasks,comments,sort_order,created_at,updated_at)
      VALUES ('legacy-desktops','a','','[{"legacyField":true}]','[{"oldComment":""}]',-1,0,0);
    INSERT INTO rest_days (id,user_id,date,created_at) VALUES ('legacy-restDays','a','old-rest-date',0);
    INSERT INTO vacation_days (id,user_id,date,created_at) VALUES ('legacy-vacationDays','a','old-vacation-date',0);
    INSERT INTO task_attachments (id,user_id,task_id,mime,data,width,height,created_at)
      VALUES ('legacy-attachments','a','legacy-tasks','old/mime',X'0001',0,-2,0);
    INSERT OR REPLACE INTO user_settings (user_id,data) VALUES ('a','false');
  `);
  const dump = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as Record<string, unknown>;
  const tables = { groups: 'habit_groups', sessions: 'sessions', tasks: 'tasks', notes: 'notes', desktops: 'desktops', restDays: 'rest_days', vacationDays: 'vacation_days', attachments: 'task_attachments' };
  for (const [collection, table] of Object.entries(tables)) sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(`legacy-${collection}`);
  sqlite.prepare('DELETE FROM user_settings WHERE user_id=?').run('a');
  expect((await post(dump)).status).toBe(200);
  const restored = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as Record<string, unknown>;
  for (const collection of Object.keys(tables)) {
    const before = (dump[collection] as { id: string }[]).find((row) => row.id === `legacy-${collection}`);
    const after = (restored[collection] as { id: string }[]).find((row) => row.id === `legacy-${collection}`);
    expect(after, collection).toEqual(before);
  }
  expect(restored.settings).toBe(false);
});

it('round-trips opaque legacy JSON without editor shape restrictions', async () => {
  sqlite.exec(`
    INSERT INTO habits (id,user_id,name,durations,created_at) VALUES ('opaque-habit','a','Legacy','{"oldChoices":[1,"x"]}',0);
    INSERT INTO notes (id,user_id,text,tags,created_at,updated_at) VALUES ('opaque-note','a','Legacy','"old-tag"',0,0);
    INSERT INTO sessions (id,user_id,type,planned_seconds,actual_seconds,started_at,ended_at,entry,created_at)
      VALUES ('opaque-session','a','legacy',0,0,0,0,'["legacy",1]',0);
    INSERT INTO desktops (id,user_id,title,tasks,comments,sort_order,created_at,updated_at)
      VALUES ('opaque-desktop','a','Legacy','{"oldTasks":[]}','"old-comments"',0,0,0);
  `);
  const dump = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as Record<string, unknown>;
  for (const [table, id] of [['habits', 'opaque-habit'], ['notes', 'opaque-note'], ['sessions', 'opaque-session'], ['desktops', 'opaque-desktop']]) {
    sqlite.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  }
  expect((await post(dump)).status).toBe(200);
  const restored = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as Record<string, unknown>;
  for (const collection of ['habits', 'notes', 'sessions', 'desktops']) expect(restored[collection]).toEqual(dump[collection]);
});

it('exports and restores JSON null settings without replacing them with defaults', async () => {
  sqlite.prepare("INSERT OR REPLACE INTO user_settings (user_id,data) VALUES ('a','null')").run();
  const dump = await (await api.request('/export', { headers: { cookie: 'sid=a' } })).json() as { settings: unknown };
  expect(dump.settings).toBeNull();
  sqlite.prepare("DELETE FROM user_settings WHERE user_id='a'").run();
  expect((await post({ settings: dump.settings })).status).toBe(200);
  expect(sqlite.prepare("SELECT data FROM user_settings WHERE user_id='a'").get()).toEqual({ data: 'null' });
});
