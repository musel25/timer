import type { Desktop } from '../../lib/types';
import { useDesktops } from '../../lib/hooks';
import { AddDesktop } from './AddDesktop';
import { DesktopRow } from './DesktopRow';

/**
 * The day, one row per Ubuntu virtual desktop, in swipe order. Numbers are
 * index+1 in sort order, so deleting desktop 2 renumbers 3→2 automatically —
 * GNOME collapse.
 */
export function DesktopsBoard() {
  const { data: all = [] } = useDesktops();

  // GET already filters/sorts; re-apply for stale service-worker cache safety.
  const live: Desktop[] = all
    .filter((d) => !d.archivedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <header className="flex items-baseline justify-between px-1 pb-2">
        <h1 className="text-2xl font-bold">Desktops</h1>
        <span className="text-xs text-slate-500">
          {live.length === 0 ? 'one row per workspace' : `${live.length} workspace${live.length === 1 ? '' : 's'}`}
        </span>
      </header>

      {live.map((d, i) => (
        <DesktopRow key={d.id} desktop={d} number={i + 1} />
      ))}

      <AddDesktop nextNumber={live.length + 1} />
    </div>
  );
}
