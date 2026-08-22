import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Thread } from '../../lib/types';
import { useSettings, useThreads } from '../../lib/hooks';
import { clearTitleCount, setTitleCount } from '../../lib/docTitle';
import { activeThread, atCap, nextUp, readyCount } from './nextUp';
import { dueThreads, fireThreadNotification, loadNotified, saveNotified } from './notify';

export interface NowValue {
  threads: Thread[];
  /** Ticking clock, so countdowns and readiness re-render without each row owning a timer. */
  now: number;
  active: Thread | null;
  suggestion: { thread: Thread; reason: 'ready' | 'stalest' } | null;
  ready: number;
  full: boolean;
  limit: number;
}

const Ctx = createContext<NowValue | null>(null);

/** Null outside a provider — Layout renders without one in tests. */
export const useNowOptional = (): NowValue | null => useContext(Ctx);

const TICK_MS = 5_000;
const DEFAULT_WIP_LIMIT = 3;

export function NowProvider({ children }: { children: ReactNode }) {
  const { data: threads = [] } = useThreads();
  const { data: settings } = useSettings();
  const [now, setNow] = useState(() => Date.now());
  const notified = useRef<string[]>(loadNotified());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // A cached /api/settings response predating this feature has neither field.
  const limit = settings?.wipLimit ?? DEFAULT_WIP_LIMIT;
  const muted = settings?.nowNudges === false;

  const ready = readyCount(threads, now);

  // Poke once per thread that comes due.
  useEffect(() => {
    const due = dueThreads({ threads, now, notified: notified.current, muted });
    if (!due.length) return;
    for (const t of due) fireThreadNotification(t);
    notified.current = [...notified.current, ...due.map((t) => t.id)];
    saveNotified(notified.current);
  }, [threads, now, muted]);

  // The tab title is the one surface visible with the window in the background.
  // It is shared with the agents dashboard, so go through the single owner.
  useEffect(() => {
    setTitleCount('now', ready);
  }, [ready]);
  useEffect(() => () => clearTitleCount('now'), []);

  const value = useMemo<NowValue>(() => ({
    threads,
    now,
    active: activeThread(threads),
    suggestion: nextUp(threads, now),
    ready,
    full: atCap(threads, limit),
    limit,
  }), [threads, now, ready, limit]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
