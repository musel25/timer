import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { migrate } from './db';
import { bootstrap } from './seed';
import { api } from './api';
import { startCalendarSync } from './gcalSync';
import { startAgents } from './agents';

migrate();
bootstrap();
startCalendarSync();

const app = new Hono();
app.use('*', logger());

// Local-dev only: Claude Code multi-session dashboard. Mounted OUTSIDE the /api
// router (and before it) so no /api auth middleware can ever reach it — POST /cc/ingest
// is intentionally unauthenticated (localhost + shared CC_DASH_TOKEN); the read
// endpoints inside enforce requireAuth. Reads this machine's ~/.claude, so it's
// meaningless on a remote prod host and stays off in production.
if (process.env.NODE_ENV !== 'production' || process.env.CC_DASH === '1') {
  const agents = startAgents();
  app.route('/cc', agents.routes);
  console.log('[timer] Claude Code dashboard mounted at /cc');
}

// API first so it always wins over the static fallback.
app.route('/api', api);

// Static SPA. In production CLIENT_DIR points at the built client; in dev the
// Vite server serves the UI and proxies /api here, so this is unused.
const clientDir = process.env.CLIENT_DIR || path.resolve(process.cwd(), '../client/dist');
const root = path.isAbsolute(clientDir) ? path.relative(process.cwd(), clientDir) || '.' : clientDir;
const indexHtml = path.join(clientDir, 'index.html');

app.use('*', serveStatic({ root }));
app.get('*', (c) => {
  if (existsSync(indexHtml)) {
    return c.html(readFileSync(indexHtml, 'utf8'));
  }
  return c.text('Not found', 404);
});

const port = Number(process.env.PORT || 8080);
// HOST lets the local always-on service bind to 127.0.0.1 only; prod leaves it unset
// (binds all interfaces, behind nginx).
serve({ fetch: app.fetch, port, hostname: process.env.HOST || undefined }, (info) => {
  console.log(`[timer] listening on http://${process.env.HOST || 'localhost'}:${info.port}`);
});
