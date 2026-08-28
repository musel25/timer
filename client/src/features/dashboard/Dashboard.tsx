import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useHabits, useGroups, useSessions, useLogSession, useDeleteSession, useRestDays, useVacationDays } from '../../lib/hooks';
import type { EntryData, Habit } from '../../lib/types';
import { habitStreak, todaySummary, todaysHabitSession, effectiveGoal, isHabitDoneToday } from '../../lib/stats';
import { startOfToday } from '../../lib/time';
import { cadenceOf, isAnchorDay, isPeriodSatisfied, occurrencesByPeriod, periodKey, targetOf } from '../../lib/cadence';
import { HabitIcon } from '../../lib/habitIcons';
import { HabitCard, type LogEntry } from '../habits/HabitCard';
import { CadenceStrip } from '../habits/CadenceStrip';
import { EntryForm, type EntrySubmission } from '../habits/EntryForm';
import { lastEntryFor } from '../habits/entries';

/**
 * The Habits dashboard: every habit as a card you log by hand. Habits are never
 * timed — timing is its own tool under /timer. Time habits open a minutes/note
 * composer; abstinence habits toggle a daily "stayed off it" check; habits with
 * a template open their structured entry form.
 *
 * Three layers share the page. Daily habits fill Today, grouped by time of day.
 * A weekly or monthly habit joins them only on its anchor day and only while its
 * period is unsatisfied — so Saturday shows Nature, and shows nothing once the
 * walk is logged. Underneath, one pill strip per layer keeps the whole week and
 * month visible (and loggable) without adding a dozen standing rows.
 */
export function Dashboard() {
  const { data: habits = [] } = useHabits();
  const { data: groups = [] } = useGroups();
  const { data: sessions = [] } = useSessions();
  const { data: restDayRows = [] } = useRestDays();
  const { data: vacationRows = [] } = useVacationDays();
  const logSession = useLogSession();
  const deleteSession = useDeleteSession();

  const today = todaySummary(sessions);
  const active = habits.filter((h) => !h.archived);
  const restDays = new Set(restDayRows.map((r) => r.date));
  const vacationDays = new Set(vacationRows.map((r) => r.date));
  const streakFor = (h: Habit) => habitStreak(h, sessions, restDays, vacationDays);

  const [showDone, setShowDone] = useState(false);
  const [entryFor, setEntryFor] = useState<Habit | null>(null);

  const daily = active.filter((h) => cadenceOf(h) === 'daily');
  const weekly = active.filter((h) => cadenceOf(h) === 'weekly');
  const monthly = active.filter((h) => cadenceOf(h) === 'monthly');

  const durOf = (h: Habit) => (h.kind !== 'time' ? Infinity : h.defaultDurationMin ?? h.durations?.[0] ?? Infinity);
  const byTime = (a: Habit, b: Habit) => durOf(a) - durOf(b) || a.name.localeCompare(b.name);
  const doneToday = (h: Habit) => isHabitDoneToday(h, today, effectiveGoal(h, startOfToday(), vacationDays), sessions);
  const doneHabits = daily.filter(doneToday).sort(byTime);

  /** Weekly/monthly habits that want attention today: anchored here, not yet met. */
  const dueNow = [...weekly, ...monthly]
    .filter((h) => isAnchorDay(h) && !isPeriodSatisfied(h, sessions))
    .sort(byTime);

  const log = (habit: Habit, entry: LogEntry) =>
    logSession.mutate({
      habitId: habit.id, minutes: entry.minutes, note: entry.note,
      endedAt: entry.endedAt, cadence: cadenceOf(habit),
    });

  /** Un-mark: delete the completion that satisfied this period. */
  const undo = (habit: Habit) => {
    const cadence = cadenceOf(habit);
    const key = periodKey(cadence, Date.now());
    const existing = cadence === 'daily'
      ? todaysHabitSession(sessions, habit.id)
      : sessions.find((s) => s.habitId === habit.id && s.completed && periodKey(cadence, s.startedAt) === key);
    if (existing) deleteSession.mutate(existing.id);
  };

  const toggleAbstain = (habit: Habit) => {
    const existing = todaysHabitSession(sessions, habit.id);
    if (existing) deleteSession.mutate(existing.id);
    else logSession.mutate({ habitId: habit.id, minutes: 0 });
  };

  const submitEntry = (habit: Habit, s: EntrySubmission) => {
    logSession.mutate({
      habitId: habit.id, minutes: s.minutes, note: s.note,
      cadence: cadenceOf(habit), entry: s.entry,
    });
    setEntryFor(null);
  };

  /** "1/2 this week" — the goal bar means nothing when minutes are not the point. */
  const progressLabel = (h: Habit) => {
    const cadence = cadenceOf(h);
    if (cadence === 'daily') return undefined;
    const target = targetOf(h);
    const done = occurrencesByPeriod(h, sessions)[periodKey(cadence, Date.now())] ?? 0;
    const unit = cadence === 'weekly' ? 'this week' : 'this month';
    return target > 1 ? `${done}/${target} ${unit}` : done > 0 ? `Done ${unit}` : `Not yet ${unit}`;
  };

  const hasForm = (h: Habit) => Boolean(h.template) || h.kind === 'check';

  const card = (h: Habit) => {
    const cadence = cadenceOf(h);
    return (
      <HabitCard
        key={h.id}
        habit={h}
        minutesToday={today.minutesByHabit[h.id] ?? 0}
        onLog={log}
        editTo={`/habits/${h.id}/edit`}
        detailTo={`/habits/${h.id}`}
        markedToday={cadence === 'daily' ? today.doneHabitIds.has(h.id) : isPeriodSatisfied(h, sessions)}
        streak={streakFor(h)}
        streakUnit={cadence === 'weekly' ? 'week' : cadence === 'monthly' ? 'month' : 'day'}
        progressLabel={progressLabel(h)}
        goalMin={effectiveGoal(h, startOfToday(), vacationDays)}
        onToggle={h.kind === 'abstain' ? toggleAbstain : undo}
        onOpenEntry={hasForm(h) ? setEntryFor : undefined}
      />
    );
  };

  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = daily.filter((h) => (!h.groupId || !groups.some((g) => g.id === h.groupId)) && !doneToday(h)).sort(byTime);

  return (
    <div className="space-y-6">
      <header className="hero flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Habits</h1>
          <div className="mt-1 text-sm text-slate-300">
            {today.count > 0 ? `Today · ${today.count} done · ${today.minutes} min` : 'Nothing logged yet today'}
          </div>
        </div>
        <Link to="/habits/new" className="btn-accent shrink-0"><Plus size={16} /> New habit</Link>
      </header>

      {ordered.map((group) => {
        const list = daily.filter((h) => h.groupId === group.id && !doneToday(h)).sort(byTime);
        if (list.length === 0) return null;
        return (
          <section key={group.id}>
            <h2 className="label mb-2 flex items-center gap-2">
              <HabitIcon name={group.emoji} size={16} /> {group.name}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(card)}
            </div>
          </section>
        );
      })}

      {ungrouped.length > 0 && (
        <section>
          <h2 className="label mb-2">Other</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ungrouped.map(card)}
          </div>
        </section>
      )}

      {dueNow.length > 0 && (
        <section>
          <h2 className="label mb-2">Due today</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dueNow.map(card)}
          </div>
        </section>
      )}

      {active.length === 0 && (
        <p className="py-8 text-center text-slate-500">No habits yet — add your first one above.</p>
      )}

      <CadenceStrip title="This week" habits={weekly} sessions={sessions} onOpen={setEntryFor} />
      <CadenceStrip title="This month" habits={monthly} sessions={sessions} onOpen={setEntryFor} />

      {doneHabits.length > 0 && (
        <section>
          <button
            onClick={() => setShowDone((v) => !v)}
            className="label flex items-center gap-1.5 text-slate-400 transition hover:text-slate-200"
          >
            ✓ {doneHabits.length} completed today · {showDone ? 'hide' : 'show'}
          </button>
          {showDone && (
            <div className="mt-2 grid gap-3 opacity-70 sm:grid-cols-2 xl:grid-cols-3">
              {doneHabits.map(card)}
            </div>
          )}
        </section>
      )}

      {entryFor && (
        <div
          data-modal
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4"
          onClick={() => setEntryFor(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-b-none rounded-t-2xl p-4 sm:rounded-2xl"
          >
            <EntryForm
              habit={entryFor}
              defaultMinutes={entryFor.defaultDurationMin ?? entryFor.durations?.[0] ?? 10}
              seed={lastEntryFor(sessions, entryFor.id) ?? ({} as EntryData)}
              onDone={(s) => submitEntry(entryFor, s)}
              onCancel={() => setEntryFor(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
