import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, formatDateShort, monthLabel, splitParts, type Issue, type MonthKey } from '@shared';
import { useStore } from '../store';

const PALETTE = [
  'bg-sky-100 text-sky-900 border-sky-200',
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-violet-100 text-violet-900 border-violet-200',
  'bg-rose-100 text-rose-900 border-rose-200',
  'bg-teal-100 text-teal-900 border-teal-200',
  'bg-orange-100 text-orange-900 border-orange-200',
  'bg-indigo-100 text-indigo-900 border-indigo-200',
  'bg-lime-100 text-lime-900 border-lime-200',
  'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200',
  'bg-cyan-100 text-cyan-900 border-cyan-200',
  'bg-pink-100 text-pink-900 border-pink-200',
];

const FIXED: Record<string, string> = {
  'Vacation Cover': 'bg-yellow-200 text-yellow-900 border-yellow-300',
  'Post-Call': 'bg-slate-200 text-slate-800 border-slate-300',
  Mammography: 'bg-pink-100 text-pink-900 border-pink-200',
  Vacation: 'bg-green-600 text-white border-green-700',
  Off: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function rotationClass(name: string | null | undefined, kind?: string): string {
  if (!name) return 'bg-white text-slate-400 border-slate-200';
  if (FIXED[name]) return FIXED[name];
  if (kind === 'external') return 'bg-stone-200 text-stone-800 border-stone-300 italic';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
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
    <span className={`inline-block whitespace-nowrap rounded border ${small ? 'px-1 text-[11px]' : 'px-1.5 py-0.5 text-xs'} font-medium ${rotationClass(name, kind)}`}>
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
    <a href={telHref(phone)} className={`whitespace-nowrap text-brand-700 hover:underline ${className}`} onClick={(e) => e.stopPropagation()}>
      📞 {phone}
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

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

const SEV: Record<string, string> = {
  error: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-900 border-amber-200',
  info: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`inline-block rounded border px-1.5 text-[11px] font-semibold uppercase ${SEV[severity]}`}>{severity}</span>;
}

export function IssueList({ issues, showDate = false, empty = 'No warnings.' }: { issues: Issue[]; showDate?: boolean; empty?: string }) {
  if (issues.length === 0) return <p className="px-4 py-3 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {issues.map((i, n) => (
        <li key={n} className="flex flex-wrap items-start gap-2 px-4 py-2 text-sm">
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
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-xl bg-white shadow-xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button className="text-2xl leading-none text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
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
      🖨 Print
    </button>
  );
}
