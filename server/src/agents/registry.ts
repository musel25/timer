import os from 'node:os';
import path from 'node:path';
import { readFileSync, readdirSync, watch, type FSWatcher } from 'node:fs';
import { applyRegistry, finishCard, getCard, snapshot } from './store';
import type { RegistryInfo } from './store';

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');
const RECONCILE_MS = 3000;
const WATCH_DEBOUNCE_MS = 300;

/**
 * Extract field 22 (starttime) from the contents of /proc/<pid>/stat. The `comm`
 * field (field 2) is wrapped in parens and may itself contain spaces or parens, so
 * we anchor on the LAST ')' and count fields from there (the next token is field 3).
 */
export function parseProcStartFromStat(stat: string): string | null {
  const rp = stat.lastIndexOf(')');
  if (rp < 0) return null;
  const rest = stat.slice(rp + 1).trim().split(/\s+/);
  // rest[0] === field 3 (state); field 22 (starttime) is therefore index 19.
  return rest[19] ?? null;
}

/** Parse a ~/.claude/sessions/<pid>.json file. Returns null if unusable. */
export function parseRegistryFile(content: string, pidFromName: number): RegistryInfo | null {
  let o: any;
  try { o = JSON.parse(content); } catch { return null; }
  if (!o || typeof o.sessionId !== 'string' || typeof o.cwd !== 'string') return null;
  return {
    sessionId: o.sessionId,
    pid: typeof o.pid === 'number' ? o.pid : pidFromName,
    procStart: o.procStart != null ? String(o.procStart) : undefined,
    cwd: o.cwd,
    entrypoint: typeof o.entrypoint === 'string' ? o.entrypoint : undefined,
    version: typeof o.version === 'string' ? o.version : undefined,
    startedAt: typeof o.startedAt === 'number' ? o.startedAt : undefined,
    status: typeof o.status === 'string' ? o.status : undefined,
  };
}

function defaultReadStat(pid: number): string | null {
  try { return readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch { return null; }
}

/**
 * A pid is alive iff /proc/<pid>/stat is readable AND (when we know procStart) its
 * starttime matches — this rejects a pid that was recycled by a different process.
 */
export function isAlive(
  pid: number,
  procStart: string | undefined,
  readStat: (pid: number) => string | null = defaultReadStat,
): boolean {
  const stat = readStat(pid);
  if (stat == null) return false;
  if (!procStart) return true;
  return parseProcStartFromStat(stat) === procStart;
}

export interface ReconcileDeps {
  now: number;
  files: { name: string; content: string }[];
  readStat?: (pid: number) => string | null;
}

/** One reconciliation pass over the (already-read) registry files. */
export function reconcile({ now, files, readStat = defaultReadStat }: ReconcileDeps): void {
  const seen = new Set<string>();
  for (const f of files) {
    const pidFromName = Number(f.name.replace(/\.json$/, '')) || 0;
    const info = parseRegistryFile(f.content, pidFromName);
    if (!info) continue; // skip mid-write / malformed files; next pass catches them
    seen.add(info.sessionId);
    const alive = isAlive(info.pid, info.procStart, readStat);
    if (process.env.CC_DASH_LOG) console.error('[cc] reg', f.name, info.sessionId.slice(0, 8), 'pid', info.pid, 'alive', alive, 'status', info.status || '-');
    if (alive) {
      applyRegistry(info, now);
    } else if (getCard(info.sessionId)) {
      // lingering file but the process is gone → the session has ended
      finishCard(info.sessionId, now, 'dead-lingering-file');
    }
  }
  // Sessions whose registry file vanished: if the pid is dead, the session has ended.
  for (const c of snapshot()) {
    if (c.pid == null || seen.has(c.sessionId)) continue;
    if (c.state === 'finished') continue;
    if (!isAlive(c.pid, c.procStart, readStat)) finishCard(c.sessionId, now, 'dead-file-vanished');
  }
}

function readFiles(): { name: string; content: string }[] {
  let names: string[];
  try { names = readdirSync(SESSIONS_DIR); } catch { return []; }
  const out: { name: string; content: string }[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try { out.push({ name, content: readFileSync(path.join(SESSIONS_DIR, name), 'utf8') }); } catch { /* mid-write */ }
  }
  return out;
}

export function reconcileNow(now = Date.now()): void {
  reconcile({ now, files: readFiles() });
}

/** Start watching the registry. Returns a stop() function. */
export function startRegistry(): () => void {
  reconcileNow(); // immediate backfill so live sessions appear even before any hook

  let debounce: NodeJS.Timeout | null = null;
  const onChange = () => {
    if (debounce) return;
    debounce = setTimeout(() => { debounce = null; reconcileNow(); }, WATCH_DEBOUNCE_MS);
  };

  let watcher: FSWatcher | null = null;
  try { watcher = watch(SESSIONS_DIR, onChange); } catch { /* dir may not exist yet; the interval covers it */ }
  const interval = setInterval(() => reconcileNow(), RECONCILE_MS);

  return () => {
    if (debounce) clearTimeout(debounce);
    watcher?.close();
    clearInterval(interval);
  };
}
