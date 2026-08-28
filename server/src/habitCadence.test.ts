import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing db.ts (it reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-cadence-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('habit cadence columns', () => {
  let sqlite: import('better-sqlite3').Database;
  let migrate: typeof import('./db').migrate;

  const cols = (table: string) =>
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string; dflt_value: string | null }[]);

  beforeAll(async () => {
    ({ sqlite, migrate } = await import('./db'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the cadence columns on habits', () => {
    expect(cols('habits').map((c) => c.name)).toEqual(
      expect.arrayContaining(['cadence', 'anchor', 'target_count', 'template']),
    );
  });

  it('creates the entry columns on sessions', () => {
    expect(cols('sessions').map((c) => c.name)).toEqual(expect.arrayContaining(['period_key', 'entry']));
  });

  it('defaults existing habits to a daily cadence with a target of one', () => {
    // The whole point of the defaults: the nine habits that predate this feature
    // keep behaving exactly as before without a data migration touching them.
    sqlite.prepare(
      `INSERT INTO habits (id, user_id, name, durations, sort_order, created_at)
       VALUES ('legacy', 'u1', 'Anki', '[5,10]', 0, 0)`,
    ).run();
    const row = sqlite.prepare('SELECT cadence, anchor, target_count, template FROM habits WHERE id = ?').get('legacy') as
      { cadence: string; anchor: number | null; target_count: number; template: string | null };
    expect(row).toEqual({ cadence: 'daily', anchor: null, target_count: 1, template: null });
  });

  it('round-trips a weekly habit and a structured entry', () => {
    sqlite.prepare(
      `INSERT INTO habits (id, user_id, name, kind, durations, cadence, anchor, target_count, template, sort_order, created_at)
       VALUES ('nature', 'u1', 'Nature', 'check', '[30]', 'weekly', 6, 1, 'courage', 0, 0)`,
    ).run();
    const h = sqlite.prepare('SELECT cadence, anchor, target_count, template FROM habits WHERE id = ?').get('nature');
    expect(h).toEqual({ cadence: 'weekly', anchor: 6, target_count: 1, template: 'courage' });

    const entry = JSON.stringify({ what: 'called the dentist', anticipated: 4, actual: 2 });
    sqlite.prepare(
      `INSERT INTO sessions (id, user_id, habit_id, type, planned_seconds, actual_seconds, started_at, ended_at, period_key, entry, created_at)
       VALUES ('s1', 'u1', 'nature', 'simple', 0, 0, 0, 0, '2026-W35', ?, 0)`,
    ).run(entry);
    const s = sqlite.prepare('SELECT period_key, entry FROM sessions WHERE id = ?').get('s1') as
      { period_key: string; entry: string };
    expect(s.period_key).toBe('2026-W35');
    expect(JSON.parse(s.entry)).toEqual({ what: 'called the dentist', anticipated: 4, actual: 2 });
  });

  it('is idempotent across repeated migrations', () => {
    expect(() => { migrate(); migrate(); }).not.toThrow();
    expect(cols('habits').filter((c) => c.name === 'cadence')).toHaveLength(1);
  });
});
