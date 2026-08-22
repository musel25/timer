import { useEffect } from 'react';
import type { Desktop } from '../../lib/types';
import { useDesktops, useSaveDesktop } from '../../lib/hooks';
import { isTypingTarget } from '../../lib/dom';
import { AddDesktop } from './AddDesktop';
import { DesktopCard } from './DesktopCard';
import { DesktopStage } from './DesktopStage';

/**
 * The home page: one card per Ubuntu virtual desktop, in swipe order. The
 * focused card (server-persisted, at most one) pins full-width on top; the
 * rest pack into an Exposé grid beneath. Numbers are index+1 in sort order,
 * so archiving desktop 2 renumbers 3→2 automatically — GNOME collapse.
 */
export function DesktopsBoard() {
  const { data: all = [] } = useDesktops();
  const save = useSaveDesktop();

  // GET already filters/sorts; re-apply for stale service-worker cache safety.
  const live = all
    .filter((d) => !d.archivedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  const numberOf = (d: Desktop) => live.findIndex((x) => x.id === d.id) + 1;
  const focused = live.find((d) => d.focused) ?? null;
  const grid = live.filter((d) => d.id !== focused?.id);

  // Esc collapses the pinned card. In a text field the first Esc only blurs it
  // (standard cancel gesture) — but a checkbox is not a typing target, so Esc
  // right after ticking a task still collapses.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const isCheckbox = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
      if (!isCheckbox && isTypingTarget(e.target)) {
        el?.blur();
        return;
      }
      save.mutate({ id: focused.id, focused: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id]);

  return (
    <div className="space-y-4">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Desktops</h1>
        <p className="text-sm text-slate-400">
          {live.length === 0
            ? 'One card per workspace, in swipe order.'
            : `${live.length} workspace${live.length === 1 ? '' : 's'} · numbered like your swipe order`}
        </p>
      </header>

      {focused && <DesktopStage key={focused.id} desktop={focused} number={numberOf(focused)} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {grid.map((d) => (
          <DesktopCard
            key={d.id}
            desktop={d}
            number={numberOf(d)}
            onOpen={() => save.mutate({ id: d.id, focused: true })}
          />
        ))}
        <AddDesktop nextNumber={live.length + 1} />
      </div>
    </div>
  );
}
