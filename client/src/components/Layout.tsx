import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store';
import { Icon } from './ui';

const NAV = [
  { to: '/', label: 'Today', end: true, public: true },
  { to: '/week', label: 'Week', public: true },
  { to: '/year', label: 'Year grid' },
  { to: '/calls', label: 'Calls' },
  { to: '/vacations', label: 'Vacations' },
  { to: '/residents', label: 'Residents', public: true },
  { to: '/warnings', label: 'Warnings' },
  { to: '/import', label: 'Import / Export' },
  { to: '/settings', label: 'Settings' },
  { to: '/audit', label: 'Audit log', admin: true },
];

export function Layout({ children, onLogout, onLogin, guest }: { children: ReactNode; onLogout: () => void; onLogin: () => void; guest: boolean }) {
  const { isAdmin, userName, engine, data } = useStore();
  const [open, setOpen] = useState(false);
  const upcoming = isAdmin ? engine.day(data.today).issues.filter((i) => i.severity !== 'info').length : 0;

  // View mode shows only the public pages; admins see everything.
  const links = NAV.filter((n) => isAdmin || n.public);
  const link = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `flex items-center rounded-lg px-3.5 py-2.5 text-sm transition-colors lg:py-2 ${isActive ? 'bg-white font-semibold text-brand-900 shadow-sm' : 'font-medium text-slate-300 hover:bg-white/10 hover:text-white'}`
      }
    >
      {n.label}
      {n.to === '/' && upcoming > 0 && <span className="ml-1.5 rounded-full bg-oncall px-1.5 text-[10px] font-bold text-amber-950">{upcoming}</span>}
    </NavLink>
  );

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 bg-brand-900 text-white shadow-[0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(14,26,51,0.5)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 lg:h-[72px]">
          <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            <Icon name={open ? 'close' : 'menu'} className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:flex">
              <Icon name="logo" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-[17px] font-semibold leading-tight tracking-tight">SGUMC Radiology</div>
              <div className="truncate text-xs text-slate-300">Resident schedule</div>
            </div>
          </div>
          <nav className="hidden flex-1 lg:flex">
            <div className="flex flex-wrap gap-1 rounded-xl bg-white/[0.07] p-1">{links.map(link)}</div>
          </nav>
          {guest ? (
            <button
              className="flex h-11 items-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold hover:bg-white/10 sm:px-4"
              onClick={onLogin}
              aria-label="Admin sign in"
            >
              <Icon name="lock" />
              <span className="hidden sm:inline">Admin sign in</span>
            </button>
          ) : (
            <>
              <div className="hidden text-right text-xs leading-tight sm:block">
                <div className="max-w-[10rem] truncate font-semibold">{userName}</div>
                <div className="text-slate-300">{isAdmin ? 'Admin · editing' : 'Read-only'}</div>
              </div>
              <button
                className="flex h-11 items-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold hover:bg-white/10"
                onClick={onLogout}
                aria-label="Sign out"
              >
                <Icon name="logout" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          )}
        </div>
        {open && <nav className="space-y-1 border-t border-white/10 px-3 pb-4 pt-2 lg:hidden">{links.map(link)}</nav>}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
