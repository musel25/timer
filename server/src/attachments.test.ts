import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

// Point the DB at a throwaway file BEFORE importing db.ts (reads TIMER_DB at import time).
const dir = mkdtempSync(join(tmpdir(), 'timer-attach-'));
process.env.TIMER_DB = join(dir, 'test.db');

describe('task_attachments migration + blob round-trip', () => {
  let sqlite: import('better-sqlite3').Database;
  let db: typeof import('./db').db;
  let migrate: typeof import('./db').migrate;
  let taskAttachments: typeof import('./schema').taskAttachments;

  beforeAll(async () => {
    ({ sqlite, db, migrate } = await import('./db'));
    ({ taskAttachments } = await import('./schema'));
    migrate();
  });

  afterAll(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates task_attachments with the expected columns', () => {
    const cols = (sqlite.prepare('PRAGMA table_info(task_attachments)').all() as { name: string }[]).map((c) => c.name);
    for (const col of ['id', 'user_id', 'task_id', 'mime', 'data', 'width', 'height', 'created_at']) {
      expect(cols).toContain(col);
    }
  });

  it('migrate() is idempotent (running twice does not throw)', () => {
    expect(() => migrate()).not.toThrow();
  });

  it('round-trips a binary blob', () => {
    const now = Date.now();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff]);
    db.insert(taskAttachments).values({
      id: 'a1', userId: 'u1', taskId: 't1', mime: 'image/png', data: bytes, width: 1, height: 1, createdAt: now,
    }).run();
    const got = db.select().from(taskAttachments).where(eq(taskAttachments.id, 'a1')).get();
    expect(got?.mime).toBe('image/png');
    expect(Buffer.from(got!.data as Buffer).equals(bytes)).toBe(true);
    expect(got?.width).toBe(1);
  });
});
