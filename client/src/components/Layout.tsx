import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store';
import { LockIcon, LogoIcon, MenuIcon } from './icons';

const NAV = [
  { to: '/', label: 'Today', end: true, public: true },
  { to: '/week', label: 'Week', public: true },
  { to: '/year', label: 'Year grid', resident: true },
  { to: '/calls', label: 'Calls', resident: true },
  { to: '/vacations', label: 'Vacations', resident: true },
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

  // Admins see everything; signed-in residents see the read-only pages; public guests only the public ones.
  const links = NAV.filter((n) => isAdmin || n.public || (!guest && (n as { resident?: boolean }).resident));
  // Guests' three links fit in the pill bar from tablet width; residents' six and the admin's full menu need a wider desktop.
  const narrow = !isAdmin && guest;
  const bar = narrow ? 'hidden md:flex' : 'hidden lg:flex';
  const burger = narrow ? 'md:hidden' : 'lg:hidden';
  const link = (n: (typeof NAV)[number], mobile = false) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-4 text-sm ${mobile ? 'min-h-11' : 'py-2'} ${
          isActive ? 'bg-white font-semibold text-navy' : 'font-medium text-[#d6deef] hover:bg-white/10 hover:text-white'
        }`
      }
    >
      {n.label}
      {n.to === '/' && upcoming > 0 && (
        <span className="rounded-full bg-amber-call px-1.5 text-[10px] font-bold text-[#1c1405]" title="Warnings today">
          {upcoming}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 bg-navy text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:h-[72px] md:gap-6">
          <button className={`icon-btn bg-white/10 ${burger}`} onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            <MenuIcon />
          </button>
          <NavLink to="/" className="flex min-w-0 flex-1 items-center gap-3 text-white hover:no-underline md:flex-none">
            <span className="hidden h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-white/10 sm:flex">
              <LogoIcon />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] md:text-lg">SGUMC Radiology</span>
              <span className="truncate text-[11px] text-[#a9b6d3] md:text-xs">Resident schedule</span>
            </span>
          </NavLink>
          {!isAdmin && (
            <nav aria-label="Main" className={`${bar} min-w-0 gap-1 rounded-xl bg-white/[0.07] p-1`}>
              {links.map((n) => link(n))}
            </nav>
          )}
          <div className="hidden flex-1 md:block" />
          {guest ? (
            <button
              className="flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-white/25 px-3 text-[13px] font-semibold hover:bg-white/10 sm:px-4"
              onClick={onLogin}
              aria-label="Sign in"
            >
              <LockIcon />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right text-[11px] leading-tight text-[#a9b6d3] sm:block">
                <div className="max-w-[9rem] truncate font-semibold text-white">{userName}</div>
                <div>{isAdmin ? 'Admin · can edit' : 'Resident view · read-only'}</div>
              </div>
              <button className="h-10 rounded-[10px] border border-white/25 px-3 text-[13px] font-semibold hover:bg-white/10" onClick={onLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>
        {isAdmin && (
          // The admin menu is long: it gets its own row under the header on desktop.
          <div className="hidden border-t border-white/10 lg:block">
            <nav aria-label="Admin" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
              {links.map((n) => link(n))}
            </nav>
          </div>
        )}
        {open && (
          <nav aria-label="Main" className={`${burger} flex flex-col gap-1 border-t border-white/10 px-3 pb-3 pt-2`}>
            {links.map((n) => link(n, true))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8 lg:py-10">{children}</main>
    </div>
  );
}
