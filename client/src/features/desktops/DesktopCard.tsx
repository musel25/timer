import { MessageSquare } from 'lucide-react';
import type { Desktop } from '../../lib/types';
import { categoryColor, solid, tint } from '../../lib/palette';
import { taskProgress } from './cardOps';

/**
 * One compact card in the Exposé grid. Everything on it is glanceable state:
 * number (its workspace position), title, lane, progress, the next open tasks,
 * and the latest journal line. Clicking pins it as the focused stage.
 */
export function DesktopCard({ desktop, number, onOpen }: { desktop: Desktop; number: number; onOpen: () => void }) {
  const color = categoryColor(desktop.lane || desktop.id);
  const { done, total } = taskProgress(desktop.tasks);
  const open = desktop.tasks.filter((t) => !t.done).slice(0, 3);
  const latest = desktop.comments[0];

  return (
    <button
      onClick={onOpen}
      className="card group flex flex-col gap-2.5 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-lg font-bold"
          style={{ background: tint(color.rgb, 0.16), color: solid(color.rgb) }}
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-snug text-slate-100">{desktop.title}</div>
          {desktop.lane && (
            <span
              className="mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-medium"
              style={{ background: tint(color.rgb, 0.14), color: solid(color.rgb) }}
            >
              {desktop.lane}
            </span>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-600">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.round((done / total) * 100)}%`, background: solid(color.rgb) }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-slate-500">{done}/{total}</span>
        </div>
      )}

      {open.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-400">
          {open.map((t) => (
            <li key={t.id} className="flex items-baseline gap-1.5 truncate">
              <span className="text-slate-600">○</span>
              <span className="truncate">{t.text}</span>
            </li>
          ))}
        </ul>
      )}

      {latest && (
        <div className="flex items-baseline gap-1.5 border-l-2 border-ink-600 pl-2 text-xs text-slate-500">
          <MessageSquare size={11} className="shrink-0 translate-y-px" />
          <span className="truncate">{latest.text}</span>
        </div>
      )}
    </button>
  );
}
