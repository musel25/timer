import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  CalendarDays, Timer, Repeat, BarChart3, StickyNote, Settings, Bot, Monitor, MoreHorizontal, type LucideIcon,
} from 'lucide-react';
import { isTypingTarget } from '../lib/dom';
import { useAgentsOptional } from './agents/AgentsContext';
import { askingCount } from './agents/sessionView';
import { CC_DASH_ENABLED } from './agents/enabled';
import { Brand } from '../components/Brand';

const groups: { title: string; tabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] }[] = [
  {
    title: 'Plan',
    tabs: [
      { to: '/week', label: 'Week', icon: CalendarDays },
      { to: '/habits', label: 'Habits', icon: Repeat },
      { to: '/desktops', label: 'Desktops', icon: Monitor },
    ],
  },
  {
    title: 'Tools',
    tabs: [
      { to: '/timer', label: 'Timer', icon: Timer },
      { to: '/stats', label: 'Progress', icon: BarChart3 },
      { to: '/notes', label: 'Notes', icon: StickyNote },

    ],
  },
  { title: 'Workspace', tabs: [{ to: '/settings', label: 'Settings', icon: Settings }] },
];

// The Claude Code dashboard tab exists only in dev (it's mounted under AgentsProvider).
const navGroups = groups.map((g) =>
  g.title === 'Tools' && CC_DASH_ENABLED
    ? { ...g, tabs: [...g.tabs, { to: '/agents', label: 'Agents', icon: Bot }] }
    : g,
);

// Sidebar order, flattened: this is what the 1-9 shortcuts and the hint numbers
// shown next to each tab both index into, so they can never drift apart.
const shortcutTabs = navGroups.flatMap((g) => g.tabs);
const shortcutKeyOf = (to: string) => {
  const i = shortcutTabs.findIndex((t) => t.to === to);
  return i >= 0 && i < 9 ? String(i + 1) : null;
};

// Four frequent destinations plus More keep every page reachable on a phone.
const mobileTabs = shortcutTabs.filter((t) => ["/week", "/habits", "/desktops", "/timer"].includes(t.to));
const moreTabs = shortcutTabs.filter((t) => !mobileTabs.includes(t));

export function Layout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMoreOpen(false); moreButton.current?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [moreOpen]);
  const agents = useAgentsOptional();
  const navigate = useNavigate();
  const waiting = agents ? askingCount(agents.cards) : 0;

  // 1-9 jump straight to the tab at that position in the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a key from a text field, a browser/OS chord (Cmd-1 switches
      // browser tabs), or a full-screen overlay whose content is what you see.
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!/^[1-9]$/.test(e.key)) return;
      if (isTypingTarget(e.target) || document.querySelector('[data-modal]')) return;
      const tab = shortcutTabs[Number(e.key) - 1];
      if (!tab) return;
      e.preventDefault();
      navigate(tab.to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <NavLink to="/week" className="sidebar-brand" aria-label="Planner home"><Brand /></NavLink>
        {navGroups.map((g) => (
          <div key={g.title} className={`nav-group${g.title === 'Workspace' ? ' nav-group-bottom' : ''}`}>
            <div className="nav-group-label">{g.title}</div>
            {g.tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `group sidebar-link${isActive ? ' is-active' : ''}`
                }
              >
                <t.icon size={19} strokeWidth={1.7} className="shrink-0" />
                {t.label}
                {t.to === '/agents' && waiting > 0 ? (
                  <span className="ml-auto rounded-full px-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: 'rgb(217 144 30)' }}>{waiting}</span>
                ) : shortcutKeyOf(t.to) && (
                  <span className="nav-shortcut">{shortcutKeyOf(t.to)}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      <main className="app-main">
        <div className="mobile-brand"><NavLink to="/week" aria-label="Planner home"><Brand compact /></NavLink></div>
        <div className="app-content">
          <Outlet />
        </div>
      </main>

      <nav className="mobile-navigation" aria-label="Mobile navigation">
        <div className="grid grid-cols-5">
          {mobileTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              onClick={() => setMoreOpen(false)}
              end={t.end}
              className={({ isActive }) =>
                `mobile-nav-link${isActive ? ' is-active' : ''}`
              }
            >
              <t.icon size={21} strokeWidth={1.7} />
              {t.label}
            </NavLink>
          ))}
          <div ref={moreRef} className="relative">
            <button ref={moreButton} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-controls="mobile-more" className="mobile-nav-link w-full"><MoreHorizontal size={21} strokeWidth={1.7} />More</button>
            {moreOpen && <div id="mobile-more" className="mobile-more-menu">
              {moreTabs.map((t) => <NavLink key={t.to} to={t.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-3 text-sm ${isActive ? 'bg-accent-soft text-accent' : 'text-slate-200 hover:bg-ink-700'}`}><t.icon size={18} />{t.label}</NavLink>)}
            </div>}
          </div>
        </div>
      </nav>
    </div>
  );
}
