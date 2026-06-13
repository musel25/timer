import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Timer as TimerIcon } from 'lucide-react';
import { useMe, useSettings } from './lib/hooks';
import { applyAccent, applyTheme } from './lib/theme';
import { Login } from './features/auth/Login';
import { Layout } from './features/Layout';
import { Dashboard } from './features/dashboard/Dashboard';
import { TodayView } from './features/tasks/TodayView';
import { WeekBoard } from './features/tasks/WeekBoard';
import { MonthCalendar } from './features/tasks/MonthCalendar';
import { Inbox } from './features/tasks/Inbox';
import { Timer } from './features/timer/Timer';
import { TimersLibrary } from './features/timers/TimersLibrary';
import { TimerEditor } from './features/timers/TimerEditor';
import { HabitEditor } from './features/habits/HabitEditor';
import { Progress } from './features/stats/Progress';
import { SettingsPage } from './features/settings/Settings';
import { AgentsProvider } from './features/agents/AgentsContext';
import { AgentsDashboard } from './features/agents/AgentsDashboard';

function Splash() {
  return (
    <div className="flex h-full items-center justify-center text-slate-500">
      <TimerIcon className="animate-pulse" size={32} />
    </div>
  );
}

function AuthedApp() {
  const { data: settings } = useSettings();
  useEffect(() => {
    if (settings?.accent) applyAccent(settings.accent);
  }, [settings?.accent]);
  useEffect(() => {
    if (settings?.theme) applyTheme(settings.theme);
  }, [settings?.theme]);

  const routes = (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<TodayView />} />
        <Route path="/week" element={<WeekBoard />} />
        <Route path="/month" element={<MonthCalendar />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/timer" element={<Timer />} />
        <Route path="/focus" element={<Navigate to="/timer" replace />} />
        <Route path="/quick" element={<Navigate to="/timer" replace />} />
        <Route path="/habits" element={<Dashboard />} />
        <Route path="/timers" element={<TimersLibrary />} />
        <Route path="/timers/new" element={<TimerEditor />} />
        <Route path="/timers/:id" element={<TimerEditor />} />
        <Route path="/habits/new" element={<HabitEditor />} />
        <Route path="/habits/:id" element={<HabitEditor />} />
        <Route path="/stats" element={<Progress />} />
        <Route path="/settings" element={<SettingsPage />} />
        {import.meta.env.DEV && <Route path="/agents" element={<AgentsDashboard />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );

  // The Claude Code dashboard is a local-dev tool — wrap the app in its provider only
  // in dev so a session needing attention alerts you anywhere (not just on /agents).
  return import.meta.env.DEV ? <AgentsProvider>{routes}</AgentsProvider> : routes;
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
