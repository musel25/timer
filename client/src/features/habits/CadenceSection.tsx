import { Check, Undo2 } from 'lucide-react';
import type { Habit, Session } from '../../lib/types';
import { cadenceRows } from './cadenceRows';
import { categoryColor, solid, tint } from '../../lib/palette';
import { HabitIcon } from '../../lib/habitIcons';

/**
 * One cadence layer as an agenda: a row per habit, ordered by the day it comes
 * round, with that day in the left column. A weekly habit with no stated day is
 * unusable — you cannot tell when you are meant to do it — so the day is the
 * first thing the row says.
 *
 * The anchor is still soft: the day column is when the habit surfaces and nudges,
 * while logging it any time in the period satisfies it. Today's row is
 * highlighted, which is the nudge that used to need its own "Due today" section.
 *
 * Any row with something logged this period keeps an undo button, so a mis-log
 * is as easy to take back here as it was on the card this replaced — including
 * a habit part-way to a target of two, which is not "satisfied" but has still
 * recorded something worth removing.
 */
export function CadenceSection({
  title,
  habits,
  sessions,
  onOpen,
  onUndo,
  weekStart = 1,
  now = Date.now(),
}: {
  title: string;
  habits: Habit[];
  sessions: Session[];
  onOpen: (h: Habit) => void;
  onUndo?: (h: Habit) => void;
  weekStart?: number;
  now?: number;
}) {
  if (habits.length === 0) return null;
  const rows = cadenceRows(habits, sessions, weekStart, now);
  const met = rows.filter((r) => r.satisfied).length;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="label">{title}</h2>
        <span className="text-xs text-slate-400">{met}/{rows.length} done</span>
      </div>
      <div className="card divide-y divide-ink-600 p-0">
        {rows.map((r) => {
          const color = categoryColor(r.habit.id);
          return (
            <div
              key={r.habit.id}
              className="group flex items-center first:rounded-t-2xl last:rounded-b-2xl"
              style={r.isToday ? { backgroundColor: tint(color.rgb, 0.07) } : undefined}
            >
            <button
              onClick={() => onOpen(r.habit)}
              title={r.satisfied ? `${r.habit.name} — done, tap to log again` : `Log ${r.habit.name}`}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition hover:bg-ink-700/40"
            >
              <span
                className={`w-10 shrink-0 text-xs ${r.isToday ? 'font-semibold' : 'text-slate-500'}`}
                style={r.isToday ? { color: solid(color.rgb) } : undefined}
              >
                {r.label}
              </span>

              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={r.satisfied
                  ? { backgroundColor: solid(color.rgb), color: '#fff' }
                  : { backgroundColor: tint(color.rgb, 0.12), color: solid(color.rgb) }}
              >
                {r.satisfied ? <Check size={15} /> : <HabitIcon name={r.habit.emoji} size={15} />}
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${r.satisfied ? 'text-slate-400' : 'font-medium text-slate-200'}`}>
                  {r.habit.name}
                </span>
                {r.habit.note && <span className="block truncate text-xs text-slate-500">{r.habit.note}</span>}
              </span>

              {r.target > 1 && (
                <span className="shrink-0 text-xs tabular-nums text-slate-400">{r.done}/{r.target}</span>
              )}
              {r.due && (
                <span
                  className={`shrink-0 text-xs ${r.isToday ? 'font-medium' : 'text-slate-500'}`}
                  style={r.isToday ? { color: solid(color.rgb) } : undefined}
                >
                  {r.due}
                </span>
              )}
            </button>
            {r.done > 0 && onUndo && (
              <button
                onClick={() => onUndo(r.habit)}
                aria-label={`Undo ${r.habit.name}`}
                title="Undo this period's log"
                className="shrink-0 px-3 py-2.5 text-slate-500 transition hover:text-slate-200"
              >
                <Undo2 size={15} />
              </button>
            )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
