import type { Context } from 'hono';

export type ApiEnv = { Variables: { userId: string } };
export type ApiContext = Context<ApiEnv>;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const uid = (c: ApiContext): string => c.get('userId');
export async function body(c: ApiContext): Promise<unknown> {
  try { return await c.req.json<unknown>(); } catch { return {}; }
}
