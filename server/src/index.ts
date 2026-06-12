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

migrate();
bootstrap();
startCalendarSync();

const app = new Hono();
app.use('*', logger());

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
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[timer] listening on http://localhost:${info.port}`);
});
