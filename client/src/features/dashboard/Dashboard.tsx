import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHabits, useGroups, useSessions, useSettings, useLogSession, useDeleteSession, useRestDays, useVacationDays } from '../../lib/hooks';
import type { Habit, PomodoroConfig } from '../../lib/types';
import { Timer, Plus, Hourglass, X } from 'lucide-react';
import { habitStreak, todaySummary, todaysHabitSession, effectiveGoal, isHabitDoneToday } from '../../lib/stats';
import { buildPomodoroPhases, workSeconds } from '../../engine/buildPhases';
import { startOfToday } from '../../lib/time';
import { HabitIcon } from '../../lib/habitIcons';
import { useRun } from '../run/RunContext';
import { HabitCard } from '../habits/HabitCard';

const POMODORO_DEFAULT: PomodoroConfig = { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 };

export function Dashboard() {
  const { data: habits = [] } = useHabits();
  const { data: groups = [] } = useGroups();
  const { data: sessions = [] } = useSessions();
  const { data: settings } = useSettings();
  const { data: restDayRows = [] } = useRestDays();
  const { data: vacationRows = [] } = useVacationDays();
  const { startRun, setTag, activeRun } = useRun();
  const logSession = useLogSession();
  const deleteSession = useDeleteSession();
  const taggedHabit = activeRun?.taggedHabitId ? habits.find((h) => h.id === activeRun.taggedHabitId) : undefined;

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

  function start(habit: Habit, min: number) {
    // While a run is active (e.g. a focus block), tapping a habit re-tags that
    // run to count toward the habit rather than starting a second timer.
    if (activeRun?.running) { setTag(habit.id); return; }
    const prep = settings?.prepSeconds ?? 5;
    startRun({
      type: 'simple',
      label: habit.name,
      habitId: habit.id,
      plannedSeconds: min * 60,
      config: { totalSeconds: min * 60, prepSeconds: prep },
    });
  }

  function startFocus() {
    const prep = settings?.prepSeconds ?? 5;
    const phases = buildPomodoroPhases(POMODORO_DEFAULT, 'Focus block', prep);
    startRun({
      type: 'interval',
      config: { prepSeconds: prep, sets: POMODORO_DEFAULT.rounds, intervals: [], cooldownSeconds: 0 },
      label: 'Focus block',
      plannedSeconds: workSeconds(phases),
      phases,
      trackMode: 'focus',
    });
  }

  const log = (habit: Habit, min: number) => logSession.mutate({ habitId: habit.id, minutes: min });
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
      onStart={start}
      onLog={log}
      editTo={`/habits/${h.id}/edit`}
      detailTo={`/habits/${h.id}`}
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
            {today.count > 0 ? `Today · ${today.count} done · ${today.minutes} min` : 'Tap a duration to start a focus block'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!activeRun?.running && (
            <button
              onClick={startFocus}
              className="flex items-center gap-1.5 rounded-full border border-ink-600/60 bg-ink-900/30 px-3 py-2 text-sm text-slate-300 backdrop-blur hover:text-slate-100"
              title="Start a focus block"
            >
              <Hourglass size={15} /> Focus
            </button>
          )}
          <Link to="/timer" className="flex items-center rounded-full border border-ink-600/60 bg-ink-900/30 p-2.5 text-slate-300 backdrop-blur hover:text-slate-100" title="Timers"><Timer size={18} /></Link>
        </div>
      </header>

      {activeRun?.running && (
        <div className="card flex items-center justify-between gap-3 p-3 text-sm">
          <span className="flex items-center gap-1.5 text-teal-300">
            <Hourglass size={15} />
            {taggedHabit
              ? <>Focus running — counting toward <strong>{taggedHabit.name}</strong>. Tap another habit to switch.</>
              : <>Focus running — tap a habit to count this block toward it.</>}
          </span>
          {taggedHabit && (
            <button onClick={() => setTag(null)} className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-200" title="Clear tag" aria-label="Clear tag">
              <X size={15} />
            </button>
          )}
        </div>
      )}

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
        <p className="py-8 text-center text-slate-500">No habits yet — add your first one below.</p>
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

      <div className="grid grid-cols-2 gap-3 pt-2 sm:max-w-md">
        <Link to="/timer" className="btn-accent"><Timer size={16} /> Timer</Link>
        <Link to="/habits/new" className="btn-ghost"><Plus size={16} /> Habit</Link>
      </div>
    </div>
  );
}
