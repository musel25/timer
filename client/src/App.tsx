import { lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Timer as TimerIcon } from 'lucide-react';
import { useMe, useSettings } from './lib/hooks';
import { applyAccent, applyTheme } from './lib/theme';
import { setVolume } from './engine/audio';
import { Login } from './features/auth/Login';
import { Layout } from './features/Layout';

import { WeekBoard } from './features/tasks/WeekBoard';

import { AgentsProvider } from './features/agents/AgentsContext';

import { CC_DASH_ENABLED } from './features/agents/enabled';

// The landing planner stays eager; other tools load when opened.
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Timer = lazy(() => import('./features/timer/Timer').then((m) => ({ default: m.Timer })));
const TimerEditor = lazy(() => import('./features/timers/TimerEditor').then((m) => ({ default: m.TimerEditor })));
const HabitEditor = lazy(() => import('./features/habits/HabitEditor').then((m) => ({ default: m.HabitEditor })));
const HabitDetail = lazy(() => import('./features/habits/HabitDetail').then((m) => ({ default: m.HabitDetail })));
const Progress = lazy(() => import('./features/stats/Progress').then((m) => ({ default: m.Progress })));
const Notes = lazy(() => import('./features/notes/Notes').then((m) => ({ default: m.Notes })));
const DesktopsBoard = lazy(() => import('./features/desktops/DesktopsBoard').then((m) => ({ default: m.DesktopsBoard })));
const SettingsPage = lazy(() => import('./features/settings/Settings').then((m) => ({ default: m.SettingsPage })));
const AgentsDashboard = lazy(() => import('./features/agents/AgentsDashboard').then((m) => ({ default: m.AgentsDashboard })));

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
        <Route path="/desktops" element={<DesktopsBoard />} />
        <Route path="/now" element={<Navigate to="/desktops" replace />} />
        <Route path="/week" element={<WeekBoard />} />
        <Route path="/timer" element={<Timer />} />
        <Route path="/focus" element={<Navigate to="/timer" replace />} />
        <Route path="/quick" element={<Navigate to="/timer" replace />} />
        <Route path="/habits" element={<Dashboard />} />
        <Route path="/timers" element={<Navigate to="/timer" replace />} />
        <Route path="/timers/new" element={<TimerEditor />} />
        <Route path="/timers/:id" element={<TimerEditor />} />
        <Route path="/habits/new" element={<HabitEditor />} />
        <Route path="/habits/:id" element={<HabitDetail />} />
        <Route path="/habits/:id/edit" element={<HabitEditor />} />
        <Route path="/stats" element={<Progress />} />
        <Route path="/notes" element={<Notes />} />
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
