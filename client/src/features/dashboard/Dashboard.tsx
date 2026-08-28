import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useHabits, useGroups, useSessions, useLogSession, useDeleteSession, useRestDays, useVacationDays, useSettings } from '../../lib/hooks';
import type { EntryData, Habit } from '../../lib/types';
import { habitStreak, todaySummary, todaysHabitSession, effectiveGoal, isHabitDoneToday } from '../../lib/stats';
import { startOfToday } from '../../lib/time';
import { cadenceOf, periodKey } from '../../lib/cadence';
import { HabitIcon } from '../../lib/habitIcons';
import { HabitCard, type LogEntry } from '../habits/HabitCard';
import { CadenceSection } from '../habits/CadenceSection';
import { EntryForm, type EntrySubmission } from '../habits/EntryForm';
import { lastEntryFor } from '../habits/entries';

/**
 * The Habits dashboard: every habit as a card you log by hand. Habits are never
 * timed — timing is its own tool under /timer. Time habits open a minutes/note
 * composer; abstinence habits toggle a daily "stayed off it" check; habits with
 * a template open their structured entry form.
 *
 * Three layers are kept visually separate, because they answer different
 * questions. "Daily" is today's list, grouped by time of day. "This week" and
 * "This month" are agendas: a row per habit ordered by the day it comes round,
 * with that day named, so there is never any doubt about when a habit is meant
 * to happen. Today's row is highlighted — that highlight is the nudge, which is
 * why a weekly habit needs no separate "due today" callout.
 */
export function Dashboard() {
  const { data: habits = [] } = useHabits();
  const { data: groups = [] } = useGroups();
  const { data: sessions = [] } = useSessions();
  const { data: restDayRows = [] } = useRestDays();
  const { data: vacationRows = [] } = useVacationDays();
  const { data: settings } = useSettings();
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

  const hasForm = (h: Habit) => Boolean(h.template) || h.kind === 'check';

  /** Daily habits only — the weekly and monthly layers render as agendas below. */
  const card = (h: Habit) => (
    <HabitCard
      key={h.id}
      habit={h}
      minutesToday={today.minutesByHabit[h.id] ?? 0}
      onLog={log}
      editTo={`/habits/${h.id}/edit`}
      detailTo={`/habits/${h.id}`}
      markedToday={today.doneHabitIds.has(h.id)}
      streak={streakFor(h)}
      goalMin={effectiveGoal(h, startOfToday(), vacationDays)}
      onToggle={h.kind === 'abstain' ? toggleAbstain : undo}
      onOpenEntry={hasForm(h) ? setEntryFor : undefined}
    />
  );

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

      {daily.length > 0 && <h2 className="label border-b border-ink-600/60 pb-1">Daily</h2>}

      {ordered.map((group) => {
        const list = daily.filter((h) => h.groupId === group.id && !doneToday(h)).sort(byTime);
        if (list.length === 0) return null;
        return (
          <section key={group.id}>
            <h3 className="label mb-2 flex items-center gap-2">
              <HabitIcon name={group.emoji} size={16} /> {group.name}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(card)}
            </div>
          </section>
        );
      })}

      {ungrouped.length > 0 && (
        <section>
          <h3 className="label mb-2">Other</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ungrouped.map(card)}
          </div>
        </section>
      )}

      {active.length === 0 && (
        <p className="py-8 text-center text-slate-500">No habits yet — add your first one above.</p>
      )}

      <CadenceSection title="This week" habits={weekly} sessions={sessions} onOpen={setEntryFor} onUndo={undo} weekStart={settings?.weekStart ?? 1} />
      <CadenceSection title="This month" habits={monthly} sessions={sessions} onOpen={setEntryFor} onUndo={undo} />

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
