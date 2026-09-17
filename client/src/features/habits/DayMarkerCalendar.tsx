import { useState } from 'react';
import { Palmtree, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRestDays, useSetRestRange, useSetVacationRange, useSettings, useVacationDays } from '../../lib/hooks';
import { keyToDate, todayKey, monthMatrix, monthLabel } from '../../lib/date';
import { INITIAL_RANGE, tapDay } from './rangeSelect';

type Mode = 'vacation' | 'rest';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The month calendar you paint rest and vacation days onto.
 *
 * Both kinds of day are *global* — they apply to every habit — which is why
 * this owns its own data and lives in Settings. It is also embedded in a single
 * habit's Month tab, where `minutesByDay`/`dotColor` add that habit's activity
 * as a dot under each date; that is the only thing about it that is ever
 * habit-specific.
 *
 * Painting is two taps (start day, end day) rather than a drag: a drag over a
 * 7-column grid on a phone is a scroll, not a selection.
 */
export function DayMarkerCalendar({ minutesByDay = {}, dotColor }: {
  minutesByDay?: Record<string, number>;
  dotColor?: string; // "R G B"
}) {
  const { data: settings } = useSettings();
  const { data: vacationRows = [] } = useVacationDays();
  const { data: restRows = [] } = useRestDays();
  const setVacationRange = useSetVacationRange();
  const setRestRange = useSetRestRange();

  const weekStart = settings?.weekStart ?? 1;
  const vacationDays = new Set(vacationRows.map((r) => r.date));
  const restDays = new Set(restRows.map((r) => r.date));

  const now = keyToDate(todayKey());
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [mode, setMode] = useState<Mode>('vacation');
  const [range, setRange] = useState(INITIAL_RANGE);

  const weeks = monthMatrix(year, month0, weekStart);
  const markedSet = mode === 'vacation' ? vacationDays : restDays;
  const apply = (start: string, end: string, on: boolean) =>
    (mode === 'vacation' ? setVacationRange : setRestRange).mutate({ start, end, on });

  function prevMonth() { const m = month0 - 1; if (m < 0) { setYear(year - 1); setMonth0(11); } else setMonth0(m); setRange(INITIAL_RANGE); }
  function nextMonth() { const m = month0 + 1; if (m > 11) { setYear(year + 1); setMonth0(0); } else setMonth0(m); setRange(INITIAL_RANGE); }

  function onDay(key: string) {
    const res = tapDay(range, key, markedSet.has(key));
    setRange(res.state);
    if (res.commit) apply(res.commit.start, res.commit.end, true);
    if (res.clearDay) apply(res.clearDay, res.clearDay, false);
  }

  const headerCols = Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStart + i) % 7]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button className={`chip ${mode === 'vacation' ? 'chip-active' : ''}`} onClick={() => { setMode('vacation'); setRange(INITIAL_RANGE); }}><Palmtree size={14} /> Vacation</button>
          <button className={`chip ${mode === 'rest' ? 'chip-active' : ''}`} onClick={() => { setMode('rest'); setRange(INITIAL_RANGE); }}><Moon size={14} /> Rest</button>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-2.5 py-1.5" onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <span className="min-w-[7.5rem] text-center text-sm font-medium">{monthLabel(year, month0)}</span>
          <button className="btn-ghost px-2.5 py-1.5" onClick={nextMonth} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {range.pendingStart
          ? 'Now tap the end day to mark the range.'
          : `Tap a start day then an end day to mark ${mode === 'vacation' ? 'vacation' : 'rest'} days. Tap a marked day to clear it.`}
      </p>

      <div className="card p-3">
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {headerCols.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((key) => {
                const inMonth = keyToDate(key).getMonth() === month0;
                const isVacation = vacationDays.has(key);
                const isRest = restDays.has(key);
                const isPending = range.pendingStart === key;
                const min = minutesByDay[key] ?? 0;
                return (
                  <button
                    key={key}
                    onClick={() => onDay(key)}
                    aria-label={keyToDate(key).toDateString()}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition ${
                      isPending ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-ink-700'
                    } ${inMonth ? 'text-slate-200' : 'text-slate-600'}`}
                  >
                    <span>{keyToDate(key).getDate()}</span>
                    <span className="mt-0.5 flex h-2 items-center gap-0.5">
                      {min > 0 && dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(${dotColor})` }} />}
                      {isVacation && <Palmtree size={11} className="text-green-500" />}
                      {isRest && <Moon size={11} className="text-violet-400" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
