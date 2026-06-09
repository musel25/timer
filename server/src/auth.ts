import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import { db } from './db';
import { authSessions } from './schema';

const COOKIE = 'sid';
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newId(): string {
  return randomBytes(16).toString('hex');
}

export function createSession(c: Context, userId: string): string {
  const id = randomBytes(32).toString('hex');
  const now = Date.now();
  db.insert(authSessions)
    .values({
      id,
      userId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      userAgent: c.req.header('user-agent') ?? null,
    })
    .run();
  setCookie(c, COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return id;
}

export function destroySession(c: Context): void {
  const id = getCookie(c, COOKIE);
  if (id) db.delete(authSessions).where(eq(authSessions.id, id)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

export function currentUserId(c: Context): string | null {
  const id = getCookie(c, COOKIE);
  if (!id) return null;
  const row = db.select().from(authSessions).where(eq(authSessions.id, id)).get();
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    db.delete(authSessions).where(eq(authSessions.id, id)).run();
    return null;
  }
  return row.userId;
}

/** Gate that rejects unauthenticated requests and exposes userId on the context. */
export const requireAuth: MiddlewareHandler<{ Variables: { userId: string } }> = async (c, next) => {
  const userId = currentUserId(c);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', userId);
  await next();
};
