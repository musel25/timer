import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'timer-range-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('applyRange helpers insert/delete inclusive ranges', () => {
  let db: typeof import('./db').db, migrate: typeof import('./db').migrate, sqlite: import('better-sqlite3').Database;
  let vacationDays: typeof import('./schema').vacationDays;
  let restDays: typeof import('./schema').restDays;
  let applyVacationRange: typeof import('./api').applyVacationRange;
  let applyRestRange: typeof import('./api').applyRestRange;
  let and: typeof import('drizzle-orm').and, eq: typeof import('drizzle-orm').eq;
  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ vacationDays, restDays } = await import('./schema'));
    ({ applyVacationRange, applyRestRange } = await import('./api'));
    ({ and, eq } = await import('drizzle-orm'));
    migrate();
  });
  afterAll(() => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

  it('marks every vacation day in the range and is idempotent', () => {
    applyVacationRange('u1', '2026-07-10', '2026-07-12', true);
    applyVacationRange('u1', '2026-07-10', '2026-07-12', true); // idempotent
    const rows = db.select().from(vacationDays).where(eq(vacationDays.userId, 'u1')).all();
    expect(rows.map((r) => r.date).sort()).toEqual(['2026-07-10', '2026-07-11', '2026-07-12']);
  });
  it('clears every vacation day in the range', () => {
    applyVacationRange('u1', '2026-07-10', '2026-07-12', false);
    const rows = db.select().from(vacationDays).where(eq(vacationDays.userId, 'u1')).all();
    expect(rows).toHaveLength(0);
  });
  it('marks and clears rest days the same way', () => {
    applyRestRange('u1', '2026-08-01', '2026-08-03', true);
    expect(db.select().from(restDays).where(eq(restDays.userId, 'u1')).all().map((r) => r.date).sort())
      .toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    applyRestRange('u1', '2026-08-01', '2026-08-03', false);
    expect(db.select().from(restDays).where(and(eq(restDays.userId, 'u1'), eq(restDays.date, '2026-08-02'))).all()).toHaveLength(0);
  });
});
