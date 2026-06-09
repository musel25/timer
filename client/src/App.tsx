import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe, useSettings } from './lib/hooks';
import { applyAccent } from './lib/theme';
import { Login } from './features/auth/Login';
import { Layout } from './features/Layout';
import { Dashboard } from './features/dashboard/Dashboard';
import { TodayView } from './features/tasks/TodayView';
import { WeekBoard } from './features/tasks/WeekBoard';
import { MonthCalendar } from './features/tasks/MonthCalendar';
import { Inbox } from './features/tasks/Inbox';
import { Focus } from './features/focus/Focus';
import { QuickTimer } from './features/quick/QuickTimer';
import { TimersLibrary } from './features/timers/TimersLibrary';
import { TimerEditor } from './features/timers/TimerEditor';
import { HabitEditor } from './features/habits/HabitEditor';
import { Progress } from './features/stats/Progress';
import { SettingsPage } from './features/settings/Settings';

function Splash() {
  return (
    <div className="flex h-full items-center justify-center text-slate-500">
      <div className="animate-pulse text-2xl">⏱</div>
    </div>
  );
}

function AuthedApp() {
  const { data: settings } = useSettings();
  useEffect(() => {
    if (settings?.accent) applyAccent(settings.accent);
  }, [settings?.accent]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<TodayView />} />
        <Route path="/week" element={<WeekBoard />} />
        <Route path="/month" element={<MonthCalendar />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/focus" element={<Focus />} />
        <Route path="/quick" element={<QuickTimer />} />
        <Route path="/habits" element={<Dashboard />} />
        <Route path="/timers" element={<TimersLibrary />} />
        <Route path="/timers/new" element={<TimerEditor />} />
        <Route path="/timers/:id" element={<TimerEditor />} />
        <Route path="/habits/new" element={<HabitEditor />} />
        <Route path="/habits/:id" element={<HabitEditor />} />
        <Route path="/stats" element={<Progress />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Splash />;
  if (!me?.user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return <AuthedApp />;
}
