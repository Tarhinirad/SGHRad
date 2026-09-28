import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store';

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
        `block rounded-md px-3 py-2 text-sm font-medium lg:py-1.5 ${isActive ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`
      }
    >
      {n.label}
      {n.to === '/' && upcoming > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{upcoming}</span>}
    </NavLink>
  );

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 bg-brand-900 text-white shadow">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <button className="rounded p-1 text-2xl leading-none lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            ☰
          </button>
          <div className="min-w-0 flex-1 lg:flex-none">
            <div className="truncate text-sm font-bold">SGUMC Radiology</div>
            <div className="truncate text-[11px] text-blue-200">Resident schedule</div>
          </div>
          <nav className="hidden flex-1 flex-wrap gap-1 lg:flex">{links.map(link)}</nav>
          {guest ? (
            <button className="rounded border border-white/30 px-2 py-1 text-xs hover:bg-white/10" onClick={onLogin}>
              Admin sign in
            </button>
          ) : (
            <>
              <div className="text-right text-[11px] leading-tight text-blue-200">
                <div className="max-w-[9rem] truncate">{userName}</div>
                <div>{isAdmin ? 'Admin (edit)' : 'Read-only'}</div>
              </div>
              <button className="rounded border border-white/30 px-2 py-1 text-xs hover:bg-white/10" onClick={onLogout}>
                Sign out
              </button>
            </>
          )}
        </div>
        {open && <nav className="border-t border-white/10 px-2 pb-3 pt-1 lg:hidden">{links.map(link)}</nav>}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 sm:py-6">{children}</main>
    </div>
  );
}
