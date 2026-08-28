import { Check } from 'lucide-react';
import type { Habit, Session } from '../../lib/types';
import { occurrencesByPeriod, periodKey, cadenceOf, targetOf } from '../../lib/cadence';
import { categoryColor, gradient, solid, tint } from '../../lib/palette';
import { HabitIcon } from '../../lib/habitIcons';

/**
 * One row of pills summarising a whole cadence layer — six weekly habits, four
 * monthly ones — each showing whether its period is satisfied and, where the
 * target is more than one, how far along it is.
 *
 * This is how a weekly habit gets logged on a day that is not its anchor: the
 * anchor only decides when a habit interrupts Today, and a walk taken on
 * Wednesday still has to be recordable. One row per layer rather than a dozen
 * standing list items — the point of the whole system is to stay lean.
 */
export function CadenceStrip({
  title,
  habits,
  sessions,
  onOpen,
  now = Date.now(),
}: {
  title: string;
  habits: Habit[];
  sessions: Session[];
  onOpen: (h: Habit) => void;
  now?: number;
}) {
  if (habits.length === 0) return null;

  return (
    <section>
      <h2 className="label mb-2">{title}</h2>
      <div className="flex flex-wrap gap-1.5">
        {habits.map((h) => {
          const color = categoryColor(h.id);
          const target = targetOf(h);
          const done = occurrencesByPeriod(h, sessions)[periodKey(cadenceOf(h), now)] ?? 0;
          const satisfied = done >= target;
          return (
            <button
              key={h.id}
              onClick={() => onOpen(h)}
              aria-pressed={satisfied}
              title={satisfied ? `${h.name} — done` : `Log ${h.name}`}
              className="chip gap-1.5 px-2.5 py-1.5 text-xs font-medium"
              style={satisfied
                ? { borderColor: solid(color.rgb), backgroundImage: gradient(color.rgb, 0.9, 0.6), color: '#fff' }
                : { borderColor: tint(color.rgb, 0.4), backgroundColor: tint(color.rgb, 0.08), color: solid(color.rgb) }}
            >
              {satisfied ? <Check size={13} /> : <HabitIcon name={h.emoji} size={13} />}
              {h.name}
              {target > 1 && <span className="opacity-70">{done}/{target}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
