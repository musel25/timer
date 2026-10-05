import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { sqlite } from './db';
import {
  createSession,
  hashPassword,
  newId,
  requireAuth,
  verifyPassword,
} from './auth';

export const grind = new Hono<{ Variables: { userId: string } }>();
grind.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024 }));
grind.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store, private');
  if (!['GET', 'HEAD'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host)
      return c.json({ error: 'cross_origin' }, 403);
    if (!c.req.header('content-type')?.startsWith('application/json'))
      return c.json({ error: 'json_required' }, 415);
  }
  await next();
});
// Bounded, process-local limits supplement nginx's deployment limits.
let windowStart = Date.now();
let registrations = 0;
const attempts = new Map<string, number>();
for (const action of ['register', 'login'] as const) {
  grind.post(`/${action}`, async (c) => {
    if (Date.now() - windowStart > 15 * 60_000) {
      windowStart = Date.now();
      registrations = 0;
      attempts.clear();
    }
    const ip = c.req.header('x-real-ip') ?? 'local';
    const n = (attempts.get(ip) ?? 0) + 1;
    if (
      attempts.size > 10_000 ||
      n > 30 ||
      (action === 'register' && registrations >= 20)
    )
      return c.json({ error: 'try_later' }, 429);
    attempts.set(ip, n);
    const parsed = z
      .object({
        email: z.string().trim().min(1).max(254),
        password: z
          .string()
          .min(action === 'register' ? 10 : 1)
          .max(256),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
    const email = parsed.data.email.toLowerCase();
    let user = sqlite
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(email) as
      { id: string; email: string; password_hash: string } | undefined;
    if (action === 'register') {
      if (!z.string().email().safeParse(email).success)
        return c.json({ error: 'invalid_email' }, 400);
      if (user) return c.json({ error: 'account_exists' }, 409);
      registrations++;
      user = {
        id: newId(),
        email,
        password_hash: hashPassword(parsed.data.password),
      };
      sqlite
        .prepare(
          'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(user.id, email, user.password_hash, Date.now());
    } else if (
      !user ||
      !verifyPassword(parsed.data.password, user.password_hash)
    )
      return c.json({ error: 'invalid_credentials' }, 401);
    createSession(c, user.id);
    return c.json(
      { user: { id: user.id, email: user.email } },
      action === 'register' ? 201 : 200,
    );
  });
}
grind.use('/account', requireAuth);
grind.use('/state', requireAuth);
grind.get('/account', (c) => {
  const user = sqlite
    .prepare('SELECT id, email FROM users WHERE id = ?')
    .get(c.get('userId'));
  return c.json({ user });
});
type Row = {
  data: string;
  version: number;
  mutation_id: string;
  updated_at: number;
};
const read = (id: string) =>
  sqlite
    .prepare(
      'SELECT data, version, mutation_id, updated_at FROM grind_states WHERE user_id = ?',
    )
    .get(id) as Row | undefined;
const response = (row?: Row) => ({
  state: row ? JSON.parse(row.data) : null,
  version: row?.version ?? 0,
  mutationId: row?.mutation_id ?? null,
  updatedAt: row?.updated_at ?? null,
});
grind.get('/state', (c) =>
  c.json({ ...response(read(c.get('userId'))), accountId: c.get('userId') }),
);
const input = z.object({
  accountId: z.string(),
  baseVersion: z.number().int().min(0),
  mutationId: z.string().min(1).max(100),
  // The server stores an opaque versioned snapshot; the app validates scheduling details.
  state: z
    .object({
      version: z.literal(1),
      revision: z.number().int().min(0),
      settings: z.record(z.unknown()),
      progress: z.record(z.unknown()),
      history: z.array(z.unknown()),
    })
    .passthrough(),
});
grind.put('/state', async (c) => {
  const p = input.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: 'invalid_state' }, 400);
  const id = c.get('userId');
  if (p.data.accountId !== id) return c.json({ error: 'account_changed' }, 403);
  const result = sqlite.transaction(() => {
    const old = read(id);
    const encoded = JSON.stringify(p.data.state);
    if (old?.mutation_id === p.data.mutationId && old.data === encoded)
      return { conflict: false, row: old };
    if ((old?.version ?? 0) !== p.data.baseVersion)
      return { conflict: true, row: old };
    const version = p.data.baseVersion + 1;
    sqlite
      .prepare(
        `INSERT INTO grind_states (user_id, data, version, mutation_id, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, version=excluded.version, mutation_id=excluded.mutation_id, updated_at=excluded.updated_at`,
      )
      .run(id, encoded, version, p.data.mutationId, Date.now());
    return { conflict: false, row: read(id) };
  })();
  return c.json(
    {
      ...response(result.row),
      accountId: id,
      ...(result.conflict ? { error: 'conflict' } : {}),
    },
    result.conflict ? 409 : 200,
  );
});
