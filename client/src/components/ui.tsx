import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, formatDateShort, monthLabel, splitParts, type Issue, type MonthKey } from '@shared';
import { useStore } from '../store';

const PALETTE = [
  'bg-sky-50 text-sky-900 border-sky-200',
  'bg-emerald-50 text-emerald-900 border-emerald-200',
  'bg-amber-50 text-amber-900 border-amber-200',
  'bg-violet-50 text-violet-900 border-violet-200',
  'bg-rose-50 text-rose-900 border-rose-200',
  'bg-teal-50 text-teal-900 border-teal-200',
  'bg-orange-50 text-orange-900 border-orange-200',
  'bg-indigo-50 text-indigo-900 border-indigo-200',
  'bg-lime-50 text-lime-900 border-lime-200',
  'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200',
  'bg-cyan-50 text-cyan-900 border-cyan-200',
  'bg-pink-50 text-pink-900 border-pink-200',
];

/** Accent per palette slot: [dot, avatar background + text]. Same order as PALETTE. */
const ACCENTS: [string, string][] = [
  ['bg-sky-500', 'bg-sky-100 text-sky-800'],
  ['bg-emerald-600', 'bg-emerald-100 text-emerald-800'],
  ['bg-amber-500', 'bg-amber-100 text-amber-800'],
  ['bg-violet-600', 'bg-violet-100 text-violet-800'],
  ['bg-rose-600', 'bg-rose-100 text-rose-800'],
  ['bg-teal-600', 'bg-teal-100 text-teal-800'],
  ['bg-orange-600', 'bg-orange-100 text-orange-800'],
  ['bg-indigo-600', 'bg-indigo-100 text-indigo-800'],
  ['bg-lime-600', 'bg-lime-100 text-lime-800'],
  ['bg-fuchsia-600', 'bg-fuchsia-100 text-fuchsia-800'],
  ['bg-cyan-600', 'bg-cyan-100 text-cyan-800'],
  ['bg-pink-600', 'bg-pink-100 text-pink-800'],
];

const FIXED: Record<string, string> = {
  'Vacation Cover': 'bg-yellow-100 text-yellow-900 border-yellow-300',
  'Post-Call': 'bg-slate-100 text-slate-700 border-slate-300',
  Mammography: 'bg-pink-50 text-pink-900 border-pink-200',
  Vacation: 'bg-green-600 text-white border-green-700',
  Off: 'bg-slate-50 text-slate-500 border-slate-200',
};

const FIXED_ACCENT: Record<string, [string, string]> = {
  'Vacation Cover': ['bg-yellow-500', 'bg-yellow-100 text-yellow-900'],
  'Post-Call': ['bg-slate-400', 'bg-slate-100 text-slate-700'],
  Mammography: ['bg-pink-600', 'bg-pink-100 text-pink-800'],
  Vacation: ['bg-green-600', 'bg-green-100 text-green-800'],
  Off: ['bg-slate-300', 'bg-slate-100 text-slate-600'],
};

function paletteIndex(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % PALETTE.length;
}

export function rotationClass(name: string | null | undefined, kind?: string): string {
  if (!name) return 'bg-white text-slate-400 border-slate-200';
  if (FIXED[name]) return FIXED[name];
  if (kind === 'external') return 'bg-stone-100 text-stone-800 border-stone-300 italic';
  return PALETTE[paletteIndex(name)];
}

/** Dot colour and avatar tint that match a rotation's chip colour. */
export function rotationAccent(name: string): { dot: string; avatar: string } {
  const [dot, avatar] = FIXED_ACCENT[name] ?? ACCENTS[paletteIndex(name)];
  return { dot, avatar };
}

export function RotationChip({ name, small }: { name: string | null; small?: boolean }) {
  const { rotByName, data } = useStore();
  if (!name) return <span className="text-slate-400">—</span>;
  const parts = splitParts(name);
  if (parts.length > 1) {
    // Split month: first half / second half.
    const d = data.settings.splitDay;
    return (
      <span className="inline-flex items-center gap-0.5" title={`Days 1–${d}: ${parts[0]} · days ${d + 1}–end: ${parts[1]}`}>
        <RotationChip name={parts[0]} small={small} />
        <span className="text-[10px] text-slate-400">/</span>
        <RotationChip name={parts[1]} small={small} />
      </span>
    );
  }
  const kind = rotByName.get(name)?.kind;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border ${small ? 'px-1.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'} font-semibold ${rotationClass(name, kind)}`}>
      {name}
      {!rotByName.has(name) && !FIXED[name] ? ' ⚠' : ''}
    </span>
  );
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function PhoneLink({ phone, className = '' }: { phone?: string; className?: string }) {
  if (!phone) return null;
  return (
    <a
      href={telHref(phone)}
      className={`inline-flex items-center gap-1 whitespace-nowrap font-medium text-brand-700 hover:text-brand-900 hover:underline ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="phone" className="h-3.5 w-3.5 shrink-0" />
      {phone}
    </a>
  );
}

/** Resident name linking to their page, optionally with a tap-to-call link. */
export function ResidentName({ id, phone = false, short = false }: { id: string | null | undefined; phone?: boolean; short?: boolean }) {
  const { resById, isAdmin } = useStore();
  if (!id) return <span className="text-slate-400">—</span>;
  const r = resById.get(id);
  if (!r) return <span className="text-red-700">{id}?</span>;
  const label = short ? shortName(r.name) : r.name;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {isAdmin ? (
        <Link to={`/residents/${r.id}`} className="font-medium hover:underline">
          {label}
        </Link>
      ) : (
        <span className="font-medium">{label}</span>
      )}
      {phone && <PhoneLink phone={r.phone} className="text-xs" />}
    </span>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, className = 'bg-brand-100 text-brand-800', size = 'md' }: { name: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dims} ${className}`}>
      {initials(name)}
    </span>
  );
}

const ICONS: Record<string, ReactNode> = {
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  week: <path d="M4 6h16M4 12h16M4 18h16" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />,
  bell: (
    <>
      <path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  logo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" />
    </>
  ),
};

/** Inline stroke icon. */
export function Icon({ name, className = 'h-4 w-4' }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name]}
    </svg>
  );
}

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

const SEV: Record<string, string> = {
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  info: 'bg-slate-50 text-slate-700 border-slate-200',
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`inline-block rounded-full border px-2 py-px text-[10px] font-bold uppercase tracking-wide ${SEV[severity]}`}>{severity}</span>;
}

export function IssueList({ issues, showDate = false, empty = 'No warnings.' }: { issues: Issue[]; showDate?: boolean; empty?: string }) {
  if (issues.length === 0) return <p className="px-5 py-4 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {issues.map((i, n) => (
        <li key={n} className="flex flex-wrap items-start gap-2 px-5 py-2.5 text-sm">
          <SeverityBadge severity={i.severity} />
          {showDate && i.date && (
            <Link to={`/day/${i.date}`} className="whitespace-nowrap font-medium text-brand-700 hover:underline">
              {formatDateShort(i.date)}
            </Link>
          )}
          {showDate && i.month && !i.date && <span className="whitespace-nowrap font-medium">{monthLabel(i.month)}</span>}
          <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">{i.message}</span>
          {i.resolvable && <span className="text-xs text-brand-700">resolvable</span>}
        </li>
      ))}
    </ul>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-brand-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} aria-label="Close">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, eyebrow, children }: { title: ReactNode; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">{title}</h1>
      </div>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Select an academic year (by its start month). */
export function YearSelect({ value, onChange }: { value: MonthKey; onChange: (v: MonthKey) => void }) {
  const { currentYearStart } = useStore();
  const options = [-2, -1, 0, 1, 2].map((n) => addMonths(currentYearStart, n * 12));
  return (
    <select className="input w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((ys) => (
        <option key={ys} value={ys}>
          {monthLabel(ys)} – {monthLabel(addMonths(ys, 11))}
        </option>
      ))}
    </select>
  );
}

export function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      <Icon name="print" /> Print
    </button>
  );
}
