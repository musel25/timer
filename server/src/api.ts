import { Hono } from 'hono';
import { requireAuth } from './auth';
import { grind } from './grind';
import { calendar } from './calendar';
import type { ApiEnv } from './routes/shared';
import { routes as authRoutes } from './routes/auth';
import { routes as timersRoutes } from './routes/timers';
import { routes as habitsRoutes } from './routes/habits';
import { routes as sessionsRoutes } from './routes/sessions';
import { routes as daysRoutes } from './routes/days';
import { routes as tasksRoutes } from './routes/tasks';
import { routes as notesRoutes } from './routes/notes';
import { routes as desktopsRoutes } from './routes/desktops';
import { routes as attachmentsRoutes } from './routes/attachments';
import { routes as settingsRoutes } from './routes/settings';
import { routes as backupRoutes } from './routes/backup';

export { habitInput } from './routes/habits';
export { applyRestRange, applyVacationRange } from './routes/days';

export const api = new Hono<ApiEnv>();
const publicRoutes = new Set([
  'GET /health',
  'POST /auth/login',
  'POST /auth/logout',
  'GET /auth/me',
  'POST /grind/login',
  'POST /grind/register',
]);

// routePath is the matched middleware path. It includes a mount prefix when
// this router is mounted at /api; strip only that prefix, never a URL guess.
api.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store, private');
  try { await next(); }
  finally { c.header('Cache-Control', 'no-store, private'); }
});
api.use('*', async (c, next) => {
  const prefix = c.req.routePath.replace(/\*$/, '').replace(/\/$/, '');
  const path = c.req.path.slice(prefix.length) || '/';
  if (publicRoutes.has(`${c.req.method} ${path}`)) return next();
  return requireAuth(c, async () => {
    const accountId = c.req.header('X-Timer-Account-Id');
    if (accountId !== undefined && accountId !== c.get('userId')) {
      c.res = c.json({ error: 'account_changed' }, 403);
      return;
    }
    await next();
  });
});

api.get('/health', (c) => c.json({ ok: true, revision: process.env.APP_REVISION || 'development' }));
api.route('/grind', grind);
api.route('/', authRoutes);
api.route('/', timersRoutes);
api.route('/', habitsRoutes);
api.route('/', sessionsRoutes);
api.route('/', daysRoutes);
api.route('/', tasksRoutes);
api.route('/', notesRoutes);
api.route('/', desktopsRoutes);
api.route('/', attachmentsRoutes);
api.route('/', settingsRoutes);
api.route('/', backupRoutes);
api.route('/calendar', calendar);
