import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE importing modules that import db.ts.
const dir = mkdtempSync(join(tmpdir(), 'timer-gcalsync-'));
process.env.TIMER_DB = join(dir, 'test.db');

type Sync = typeof import('./gcalSync');
let sync: Sync;

beforeAll(async () => {
  const { migrate } = await import('./db');
  migrate();
  sync = await import('./gcalSync');
});

afterAll(async () => {
  const { sqlite } = await import('./db');
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const task = (o: Partial<Parameters<Sync['planReconcile']>[0][number]> = {}) => ({
  id: 't1',
  title: 'Buy milk',
  date: '2026-06-12' as string | null,
  done: false,
  gcalEventId: null as string | null,
  ...o,
});

describe('eventTitle', () => {
  it('prefixes done tasks with a check', () => {
    expect(sync.eventTitle({ title: 'Buy milk', done: false })).toBe('Buy milk');
    expect(sync.eventTitle({ title: 'Buy milk', done: true })).toBe('✓ Buy milk');
  });
});

describe('nextDay', () => {
  it('handles month and year rollovers', () => {
    expect(sync.nextDay('2026-06-12')).toBe('2026-06-13');
    expect(sync.nextDay('2026-06-30')).toBe('2026-07-01');
    expect(sync.nextDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('taskToEventBody', () => {
  it('builds an all-day event with exclusive end date', () => {
    expect(sync.taskToEventBody(task())).toEqual({
      summary: 'Buy milk',
      start: { date: '2026-06-12' },
      end: { date: '2026-06-13' },
    });
  });

  it('throws on an undated task', () => {
    expect(() => sync.taskToEventBody(task({ date: null }))).toThrow();
  });
});

describe('planReconcile', () => {
  const ev = (id: string, summary: string, date: string) => ({ id, summary, start: { date }, end: { date: sync.nextDay(date) } });

  it('inserts tasks with no event (or a dangling event id)', () => {
    const plan = sync.planReconcile([task(), task({ id: 't2', gcalEventId: 'gone' })], []);
    expect(plan.inserts.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(plan.patches).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('patches when title or date drift', () => {
    const events = [ev('e1', 'Old title', '2026-06-12'), ev('e2', 'Same', '2026-06-10')];
    const plan = sync.planReconcile(
      [task({ gcalEventId: 'e1' }), task({ id: 't2', title: 'Same', date: '2026-06-11', gcalEventId: 'e2' })],
      events,
    );
    expect(plan.patches.map((p) => p.eventId).sort()).toEqual(['e1', 'e2']);
    expect(plan.inserts).toEqual([]);
  });

  it('patches when done state changed (title prefix)', () => {
    const plan = sync.planReconcile([task({ done: true, gcalEventId: 'e1' })], [ev('e1', 'Buy milk', '2026-06-12')]);
    expect(plan.patches.length).toBe(1);
  });

  it('leaves in-sync pairs alone and deletes orphans', () => {
    const plan = sync.planReconcile(
      [task({ gcalEventId: 'e1' })],
      [ev('e1', 'Buy milk', '2026-06-12'), ev('e-orphan', 'Manual junk', '2026-06-12')],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.patches).toEqual([]);
    expect(plan.deletes).toEqual(['e-orphan']);
  });
});
