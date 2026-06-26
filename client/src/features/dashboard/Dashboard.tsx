import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useHabits, useGroups, useSessions, useLogSession, useDeleteSession, useRestDays, useVacationDays } from '../../lib/hooks';
import type { Habit } from '../../lib/types';
import { habitStreak, todaySummary, todaysHabitSession, effectiveGoal, isHabitDoneToday } from '../../lib/stats';
import { startOfToday } from '../../lib/time';
import { HabitIcon } from '../../lib/habitIcons';
import { HabitCard, type LogEntry } from '../habits/HabitCard';

/**
 * The Habits dashboard: every habit as a card you log by hand (no timers live
 * here — timing is its own tool under /timer). Time habits open a minutes/note
 * composer; abstinence habits toggle a daily "stayed off it" check.
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
  const durOf = (h: Habit) => (h.kind === 'abstain' ? Infinity : h.defaultDurationMin ?? h.durations?.[0] ?? Infinity);
  const byTime = (a: Habit, b: Habit) => durOf(a) - durOf(b) || a.name.localeCompare(b.name);
  const doneToday = (h: Habit) => isHabitDoneToday(h, today, effectiveGoal(h, startOfToday(), vacationDays));
  const doneHabits = active.filter(doneToday).sort(byTime);

  const log = (habit: Habit, entry: LogEntry) =>
    logSession.mutate({ habitId: habit.id, minutes: entry.minutes, note: entry.note, endedAt: entry.endedAt });
  const toggleAbstain = (habit: Habit) => {
    const existing = todaysHabitSession(sessions, habit.id);
    if (existing) deleteSession.mutate(existing.id);
    else logSession.mutate({ habitId: habit.id, minutes: 0 });
  };

  const card = (h: Habit) => (
    <HabitCard
      key={h.id}
      habit={h}
      minutesToday={today.minutesByHabit[h.id] ?? 0}
      onLog={log}
      editTo={`/habits/${h.id}`}
      markedToday={today.doneHabitIds.has(h.id)}
      streak={streakFor(h)}
      goalMin={effectiveGoal(h, startOfToday(), vacationDays)}
      onToggle={toggleAbstain}
    />
  );

  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = active.filter((h) => (!h.groupId || !groups.some((g) => g.id === h.groupId)) && !doneToday(h)).sort(byTime);

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
        const list = active.filter((h) => h.groupId === group.id && !doneToday(h)).sort(byTime);
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

      {active.length === 0 && (
        <p className="py-8 text-center text-slate-500">No habits yet — add your first one above.</p>
      )}

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
    </div>
  );
}
