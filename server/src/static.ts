import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';

/** Public SPA delivery, kept separate from API/auth routes. */
export function createStaticApp(clientDir: string) {
  const app = new Hono();
  const root = path.isAbsolute(clientDir) ? path.relative(process.cwd(), clientDir) || '.' : clientDir;
  const indexHtml = path.join(clientDir, 'index.html');
  // Hashed build assets are safe to reuse indefinitely; HTML and the worker
  // must revalidate so a browser can discover the next deployment.
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-cache');
    await next();
  });
  app.use('/assets/*', async (c, next) => {
    c.header('Vary', 'Accept-Encoding');
    await next();
    if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  const compressAsset = compress();
  // Ranges address bytes of the original file, not a compressed stream.
  app.use('/assets/*', (c, next) => c.req.header('Range') ? next() : compressAsset(c, next));
  app.use('*', serveStatic({ root }));
  app.get('/assets/*', (c) => c.text('Not found', 404));
  app.get('*', (c) => existsSync(indexHtml) ? c.html(readFileSync(indexHtml, 'utf8')) : c.text('Not found', 404));
  return app;
}
