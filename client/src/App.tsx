import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Timer as TimerIcon } from 'lucide-react';
import { useMe, useSettings } from './lib/hooks';
import { applyAccent, applyTheme } from './lib/theme';
import { setVolume } from './engine/audio';
import { Login } from './features/auth/Login';
import { Layout } from './features/Layout';
import { Dashboard } from './features/dashboard/Dashboard';
import { WeekBoard } from './features/tasks/WeekBoard';
import { Timer } from './features/timer/Timer';
import { TimersLibrary } from './features/timers/TimersLibrary';
import { TimerEditor } from './features/timers/TimerEditor';
import { HabitEditor } from './features/habits/HabitEditor';
import { HabitDetail } from './features/habits/HabitDetail';
import { Progress } from './features/stats/Progress';
import { SettingsPage } from './features/settings/Settings';
import { AgentsProvider } from './features/agents/AgentsContext';
import { AgentsDashboard } from './features/agents/AgentsDashboard';
import { CC_DASH_ENABLED } from './features/agents/enabled';

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
  useEffect(() => {
    if (settings?.volume != null) setVolume(settings.volume);
  }, [settings?.volume]);

  const routes = (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/week" replace />} />
        <Route path="/week" element={<WeekBoard />} />
        <Route path="/timer" element={<Timer />} />
        <Route path="/focus" element={<Navigate to="/timer" replace />} />
        <Route path="/quick" element={<Navigate to="/timer" replace />} />
        <Route path="/habits" element={<Dashboard />} />
        <Route path="/timers" element={<TimersLibrary />} />
        <Route path="/timers/new" element={<TimerEditor />} />
        <Route path="/timers/:id" element={<TimerEditor />} />
        <Route path="/habits/new" element={<HabitEditor />} />
        <Route path="/habits/:id" element={<HabitDetail />} />
        <Route path="/habits/:id/edit" element={<HabitEditor />} />
        <Route path="/stats" element={<Progress />} />
        <Route path="/settings" element={<SettingsPage />} />
        {CC_DASH_ENABLED && <Route path="/agents" element={<AgentsDashboard />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );

  // Wrap the app in the dashboard provider only when enabled, so a session needing
  // attention alerts you anywhere (not just on /agents).
  return CC_DASH_ENABLED ? <AgentsProvider>{routes}</AgentsProvider> : routes;
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
