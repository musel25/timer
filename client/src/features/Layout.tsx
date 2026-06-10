import { NavLink, Outlet } from 'react-router-dom';
import {
  Star, CalendarDays, CalendarRange, Inbox, Timer, Repeat, BarChart3, Settings, type LucideIcon,
} from 'lucide-react';

const groups: { title: string; tabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] }[] = [
  {
    title: 'Plan',
    tabs: [
      { to: '/', label: 'Today', icon: Star, end: true },
      { to: '/week', label: 'Week', icon: CalendarDays },
      { to: '/month', label: 'Month', icon: CalendarRange },
      { to: '/inbox', label: 'Inbox', icon: Inbox },
    ],
  },
  {
    title: 'Tools',
    tabs: [
      { to: '/timer', label: 'Timer', icon: Timer },
      { to: '/habits', label: 'Habits', icon: Repeat },
      { to: '/stats', label: 'Progress', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

// Most-used items for the mobile bottom bar.
const mobileTabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Today', icon: Star, end: true },
  { to: '/week', label: 'Week', icon: CalendarDays },
  { to: '/timer', label: 'Timer', icon: Timer },
  { to: '/stats', label: 'Progress', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  return (
    <div className="flex h-full w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-ink-600/70 bg-ink-900/40 px-3 py-5 backdrop-blur-xl md:flex">
        <div className="mb-5 flex items-center gap-2.5 px-3 text-lg font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-lg" style={{ backgroundImage: 'linear-gradient(135deg, rgb(var(--accent)), rgb(124 92 246))', boxShadow: '0 6px 16px rgb(var(--accent) / 0.4)' }}><Timer size={17} /></span>Timer
        </div>
        {groups.map((g) => (
          <div key={g.title} className="mt-2">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.title}</div>
            {g.tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.2)]'
                      : 'text-slate-300 hover:bg-ink-700/70'
                  }`
                }
              >
                <t.icon size={18} className="shrink-0" />
                {t.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-10 md:pb-12 md:pt-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-ink-600 bg-ink-800/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isActive ? 'text-accent' : 'text-slate-400'}`
              }
            >
              <t.icon size={20} />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
