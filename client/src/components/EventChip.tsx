import { CalendarClock } from 'lucide-react';
import type { CalendarEvent } from '../lib/types';
import { eventTimeLabel } from '../lib/calendar';

/** Read-only Google Calendar event — deliberately muted next to tasks. */
export function EventChip({ event }: { event: CalendarEvent }) {
  const time = eventTimeLabel(event);
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-ink-600/60 bg-ink-900/40 px-2 py-1.5 text-xs text-slate-400" title={event.title}>
      <CalendarClock size={12} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words leading-snug">{event.title}</span>
      {time && <span className="shrink-0 tabular-nums">{time}</span>}
    </div>
  );
}
