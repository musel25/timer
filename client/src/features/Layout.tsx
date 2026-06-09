import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/focus', label: 'Focus', icon: '🍅', end: false },
  { to: '/timers', label: 'Timers', icon: '⏱', end: false },
  { to: '/stats', label: 'Progress', icon: '📊', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙️', end: false },
];

export function Layout() {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl">
      {/* Desktop sidebar (md and up) */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-ink-700/60 px-3 py-5 md:flex">
        <div className="mb-4 px-3 text-lg font-bold">⏱<span className="ml-2">Timer</span></div>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-accent-soft text-accent' : 'text-slate-300 hover:bg-ink-700/50'
              }`
            }
          >
            <span className="text-lg">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav (below md) — unchanged phone experience */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-ink-700/70 bg-ink-800/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {tabs.map((t) => (
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
