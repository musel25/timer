import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

const dir = mkdtempSync(join(tmpdir(), 'timer-schema-'));
process.env.TIMER_DB = join(dir, 'test.db');
let sqlite: import('better-sqlite3').Database;
let migrate: typeof import('./db').migrate;
beforeAll(async () => { ({ sqlite, migrate } = await import('./db')); migrate(); });
afterAll(() => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

type Column = { name: string; type: string; notnull: number; pk: number; dflt_value: string | null };
function defaultSql(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  return `'${typeof value === 'string' ? value : JSON.stringify(value)}'`;
}
function checkSchema() {
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table);
    const columns = sqlite.prepare(`PRAGMA table_info(${config.name})`).all() as Column[];
    expect(columns.map((column) => column.name).sort(), config.name).toEqual(config.columns.map((column) => column.name).sort());
    for (const expected of config.columns) {
      const actual = columns.find((column) => column.name === expected.name)!;
      expect(actual.type.toLowerCase(), `${config.name}.${expected.name} type`).toBe(expected.getSQLType());
      // SQLite text primary keys permit NULL unless NOT NULL is explicit. The
      // existing schema retains that legacy detail; compare other constraints.
      if (!expected.primary) expect(Boolean(actual.notnull), `${config.name}.${expected.name} nullability`).toBe(expected.notNull);
      expect(actual.dflt_value, `${config.name}.${expected.name} default`).toBe(defaultSql(expected.default));
      expect(Boolean(actual.pk), `${config.name}.${expected.name} primary key`).toBe(expected.primary || config.primaryKeys.some((pk) => pk.columns.includes(expected)));
    }
  }
}
describe('SQLite schema matches Drizzle metadata', () => {
  it('checks every column, type, default and key in a fresh database', checkSchema);
  it('checks upgraded tables and keeps existing data', () => {
    sqlite.prepare("INSERT INTO habits (id,user_id,name,durations,created_at) VALUES ('existing','u','Keep me','[5]',0)").run();
    for (const [table, columns] of [
      ['habits', ['cadence', 'anchor', 'anchor_week', 'target_count', 'template', 'weekend_goal_min', 'vacation_goal_min', 'hidden_on']],
      ['sessions', ['category', 'parent_session_id', 'period_key', 'entry', 'focus_seconds', 'completed_sets']],
      ['tasks', ['hidden_on', 'archived_at', 'gcal_event_id']],
      ['notes', ['archived_at']],
    ] as const) for (const column of columns) sqlite.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    migrate();
    checkSchema();
    expect(sqlite.prepare("SELECT name,durations,cadence FROM habits WHERE id='existing'").get()).toEqual({ name: 'Keep me', durations: '[5]', cadence: 'daily' });
  });
});
