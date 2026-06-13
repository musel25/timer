import type { Hono } from 'hono';
import { startRegistry } from './registry';
import { startSweep } from './sweep';
import { createAgentsRoutes } from './routes';

/**
 * Start the Claude Code session collector: watch the local session registry, sweep
 * stale cards, and expose the dashboard routes. Returns the routes sub-app to mount
 * and a stop() to tear everything down. Intended for local-dev use only.
 */
export function startAgents(): { routes: Hono; stop: () => void } {
  const stopRegistry = startRegistry();
  const stopSweep = startSweep();
  return {
    routes: createAgentsRoutes(),
    stop: () => { stopRegistry(); stopSweep(); },
  };
}
