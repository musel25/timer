import { NavLink, Outlet } from 'react-router-dom';

const groups: { title: string; tabs: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  {
    title: 'Plan',
    tabs: [
      { to: '/', label: 'Today', icon: '★', end: true },
      { to: '/week', label: 'Week', icon: '🗓' },
      { to: '/month', label: 'Month', icon: '📅' },
      { to: '/inbox', label: 'Inbox', icon: '📥' },
    ],
  },
  {
    title: 'Tools',
    tabs: [
      { to: '/timer', label: 'Timer', icon: '🍅' },
      { to: '/habits', label: 'Habits', icon: '↻' },
      { to: '/stats', label: 'Progress', icon: '📊' },
      { to: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

// Most-used items for the mobile bottom bar.
const mobileTabs = [
  { to: '/', label: 'Today', icon: '★', end: true },
  { to: '/week', label: 'Week', icon: '🗓' },
  { to: '/timer', label: 'Timer', icon: '🍅' },
  { to: '/stats', label: 'Progress', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Layout() {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-ink-600 px-3 py-5 md:flex">
        <div className="mb-4 flex items-center gap-2 px-3 text-lg font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm text-white">◗</span>Timer
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
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-accent-soft text-accent' : 'text-slate-300 hover:bg-ink-700'
                  }`
                }
              >
                <span className="w-5 text-center text-base">{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-6">
        <Outlet />
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
              <span className="text-lg">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
