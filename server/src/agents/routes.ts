import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireAuth } from '../auth';
import { applyHook, snapshot, subscribe } from './store';
import type { Delta } from './store';
import { tokenOk } from './token';

const MAX_SSE_CLIENTS = 8;
const HEARTBEAT_MS = 15_000;
let sseClients = 0;

/**
 * The Claude Code dashboard sub-app. Mounted OUTSIDE the /api router so /api auth
 * middleware can never reach it:
 *   POST /ingest   — public (no cookie), guarded by the CC_DASH_TOKEN shared secret
 *   GET  /snapshot — requireAuth (browser sends the sid cookie)
 *   GET  /stream   — requireAuth, Server-Sent Events
 */
export function createAgentsRoutes(): Hono {
  const app = new Hono();

  app.post('/ingest', async (c) => {
    if (!tokenOk(c.req.header('x-cc-token'), process.env.CC_DASH_TOKEN || '')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    let payload: any;
    try { payload = await c.req.json(); } catch { return c.json({ error: 'bad_json' }, 400); }
    if (payload && typeof payload.session_id === 'string' && typeof payload.hook_event_name === 'string') {
      applyHook(payload, Date.now());
    }
    return c.json({ ok: true });
  });

  app.use('/snapshot', requireAuth);
  app.use('/stream', requireAuth);

  app.get('/snapshot', (c) => c.json(snapshot()));

  app.get('/stream', (c) => {
    if (sseClients >= MAX_SSE_CLIENTS) return c.json({ error: 'too_many_clients' }, 429);
    // Defeat proxy/nginx response buffering so events flush immediately.
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('X-Accel-Buffering', 'no');

    return streamSSE(c, async (stream) => {
      sseClients++;
      const queue: Delta[] = [];
      let wake: (() => void) | null = null;
      const unsub = subscribe((d) => { queue.push(d); wake?.(); wake = null; });
      stream.onAbort(() => { wake?.(); wake = null; });
      try {
        await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(snapshot()) });
        while (!stream.aborted && !stream.closed) {
          while (queue.length && !stream.aborted) {
            const d = queue.shift()!;
            await stream.writeSSE({ event: d.type, data: JSON.stringify(d) });
          }
          if (stream.aborted || stream.closed) break;
          // Wait for the next delta or a heartbeat tick, whichever comes first.
          await Promise.race([
            new Promise<void>((r) => { wake = r; }),
            stream.sleep(HEARTBEAT_MS),
          ]);
          if (!stream.aborted && !stream.closed) {
            await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
          }
        }
      } finally {
        unsub();
        sseClients--;
      }
    });
  });

  return app;
}
