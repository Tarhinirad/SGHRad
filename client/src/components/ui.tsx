import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, comboParts, formatDateShort, monthLabel, splitParts, type Issue, type MonthKey } from '@shared';
import { useStore } from '../store';
import { PhoneIcon, PrintIcon } from './icons';

/** Rotation colours from the redesign: dot (accent), tint (background) and ink (text on tint). */
export interface RotationColors {
  dot: string;
  tint: string;
  ink: string;
}

const C = {
  amber: { dot: '#d97706', tint: '#fef3c7', ink: '#92400e' },
  teal: { dot: '#0d9488', tint: '#ccfbf1', ink: '#115e59' },
  green: { dot: '#059669', tint: '#d1fae5', ink: '#065f46' },
  rose: { dot: '#e11d48', tint: '#ffe4e6', ink: '#9f1239' },
  orange: { dot: '#ea580c', tint: '#ffedd5', ink: '#9a3412' },
  cyan: { dot: '#0891b2', tint: '#cffafe', ink: '#155e75' },
  violet: { dot: '#7c3aed', tint: '#ede9fe', ink: '#5b21b6' },
  gold: { dot: '#ca8a04', tint: '#fef9c3', ink: '#854d0e' },
  pink: { dot: '#db2777', tint: '#fce7f3', ink: '#9d174d' },
  indigo: { dot: '#4f46e5', tint: '#e0e7ff', ink: '#3730a3' },
  sky: { dot: '#0284c7', tint: '#e0f2fe', ink: '#075985' },
  lime: { dot: '#65a30d', tint: '#ecfccb', ink: '#3f6212' },
} satisfies Record<string, RotationColors>;

const PALETTE: RotationColors[] = [C.sky, C.indigo, C.lime, C.teal, C.violet, C.orange, C.cyan, C.rose, C.gold, C.green, C.amber, C.pink];

const FIXED: Record<string, RotationColors> = {
  Body: C.amber,
  Chest: C.teal,
  MSK: C.green,
  Neuro: C.rose,
  US: C.orange,
  IR: C.cyan,
  'Body MRI': C.violet,
  Nuclear: C.gold,
  Mammography: C.pink,
  'Vacation Cover': { dot: '#f2b233', tint: '#fdf0cf', ink: '#7a5300' },
  'Post-Call': { dot: '#5b6478', tint: '#e6e9ef', ink: '#36405a' },
  Vacation: { dot: '#059669', tint: '#059669', ink: '#ffffff' },
  Off: { dot: '#9aa3b5', tint: '#eef0f4', ink: '#5b6478' },
};

const EXTERNAL: RotationColors = { dot: '#78716c', tint: '#ece9e6', ink: '#44403c' };
const NONE: RotationColors = { dot: '#c9ced9', tint: '#ffffff', ink: '#9aa3b5' };

export function rotationColors(name: string | null | undefined, kind?: string): RotationColors {
  if (!name) return NONE;
  if (FIXED[name]) return FIXED[name];
  if (kind === 'external') return EXTERNAL;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Inline style for a rotation-coloured control (chips, the year-grid selects). */
export function rotationStyle(name: string | null | undefined, kind?: string): React.CSSProperties {
  const c = rotationColors(name, kind);
  return { background: c.tint, color: c.ink, borderColor: name ? `${c.dot}40` : '#dfe3ea', fontStyle: kind === 'external' ? 'italic' : undefined };
}

export function RotationDot({ name, size = 10 }: { name: string; size?: number }) {
  const { rotByName } = useStore();
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: rotationColors(name, rotByName.get(name)?.kind).dot }}
    />
  );
}

export function RotationChip({ name, small }: { name: string | null; small?: boolean }) {
  const { rotByName, data } = useStore();
  if (!name) return <span className="text-muted">—</span>;
  const parts = splitParts(name);
  if (parts.length > 1) {
    // Split month: first half / second half.
    const d = data.settings.splitDay;
    return (
      <span className="inline-flex items-center gap-0.5" title={`Days 1–${d}: ${parts[0]} · days ${d + 1}–end: ${parts[1]}`}>
        <RotationChip name={parts[0]} small={small} />
        <span className="text-[10px] text-muted">/</span>
        <RotationChip name={parts[1]} small={small} />
      </span>
    );
  }
  const combo = comboParts(name);
  if (combo.length > 1) {
    // One resident covering several rotations at once.
    return (
      <span className="inline-flex flex-wrap items-center gap-0.5" title={`Covers ${combo.join(' and ')}`}>
        {combo.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-0.5">
            {i > 0 && <span className="text-[10px] font-bold text-muted">+</span>}
            <RotationChip name={c} small={small} />
          </span>
        ))}
      </span>
    );
  }
  const kind = rotByName.get(name)?.kind;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border ${small ? 'px-1.5 text-[11px]' : 'px-2 py-0.5 text-xs'} font-semibold`}
      style={rotationStyle(name, kind)}
    >
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
      <PhoneIcon size={13} className="mr-1 inline -translate-y-px" />
      {phone}
    </a>
  );
}

/** Resident name linking to their page, optionally with a tap-to-call link. */
export function ResidentName({ id, phone = false, short = false }: { id: string | null | undefined; phone?: boolean; short?: boolean }) {
  const { resById, isAdmin } = useStore();
  if (!id) return <span className="text-muted">—</span>;
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
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

const SEV: Record<string, string> = {
  error: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-900 border-amber-200',
  info: 'bg-[#eef0f4] text-navy-ink border-line',
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`inline-block rounded border px-1.5 text-[11px] font-semibold uppercase ${SEV[severity]}`}>{severity}</span>;
}

export function IssueList({ issues, showDate = false, empty = 'No warnings.' }: { issues: Issue[]; showDate?: boolean; empty?: string }) {
  if (issues.length === 0) return <p className="px-5 py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
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
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-navy-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="m-0 text-xl font-semibold">{title}</h2>
          <button className="text-2xl leading-none text-muted hover:text-navy-ink" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="m-0 text-[28px] font-semibold leading-tight md:text-4xl">{title}</h1>
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
      <PrintIcon />
      Print
    </button>
  );
}

/**
 * Rotation picker that also allows one resident to cover several rotations at once:
 * one select per rotation plus a "+" button to add another ("Body+IR").
 */
export function ComboSelect({
  value,
  onChange,
  label,
  blank = '—',
  monthlyOnly = true,
  noSpecial = false,
  extraOptions = [],
  compact = true,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  blank?: string;
  monthlyOnly?: boolean;
  noSpecial?: boolean;
  extraOptions?: { value: string; label: string }[];
  compact?: boolean;
}) {
  const { data, rotByName } = useStore();
  const [adding, setAdding] = useState(false);
  const parts = comboParts(value);
  const options = data.rotations.filter((r) => (!monthlyOnly || r.monthly) && !(noSpecial && r.kind === 'special'));
  const isSpecial = (v: string) => rotByName.get(v)?.kind === 'special';
  const combinable = options.filter((o) => o.kind !== 'special');
  const canAdd = parts.length > 0 && !parts.some(isSpecial) && !extraOptions.some((x) => x.value === value);

  const cls = compact
    ? 'w-full min-w-[6.5rem] rounded-md border px-1 py-1 text-xs font-medium print:appearance-none'
    : 'input';
  const sel = (v: string, set: (x: string) => void, aria: string, opts: typeof options, first: string, extras = extraOptions) => (
    <select
      style={compact ? rotationStyle(v, rotByName.get(v)?.kind) : undefined}
      className={`${cls} ${v && !rotByName.has(v) && !extras.some((x) => x.value === v) ? 'ring-2 ring-red-500' : ''}`}
      value={v}
      onChange={(e) => set(e.target.value)}
      aria-label={aria}
    >
      <option value="">{first}</option>
      {opts.map((o) => (
        <option key={o.name} value={o.name}>
          {o.name}
        </option>
      ))}
      {extras.map((x) => (
        <option key={x.value} value={x.value}>
          {x.label}
        </option>
      ))}
      {v && !rotByName.has(v) && !extras.some((x) => x.value === v) && <option value={v}>{v} (unknown)</option>}
    </select>
  );

  const setPart = (i: number, v: string) => {
    const next = [...parts];
    if (v) next[i] = v;
    else next.splice(i, 1);
    // Special roles (Vacation Cover, Post-Call) and extra options (Off) stand alone.
    if (v && (isSpecial(v) || extraOptions.some((x) => x.value === v))) return onChange(v);
    onChange([...new Set(next)].join('+'));
  };

  const addBtn = canAdd && !adding && (
    <button
      type="button"
      className={
        compact
          ? 'no-print rounded px-1 text-[12px] font-bold leading-6 text-muted hover:bg-[#eef0f4] hover:text-navy-ink'
          : 'no-print self-start rounded px-1 text-xs font-semibold text-muted hover:bg-[#eef0f4] hover:text-navy-ink'
      }
      title="This resident also covers another rotation"
      aria-label={`${label}: add another rotation`}
      onClick={() => setAdding(true)}
    >
      {compact ? '+' : '+ rotation'}
    </button>
  );

  const selects = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {(parts.length ? parts : ['']).map((p, i) =>
        sel(
          p,
          (v) => setPart(i, v),
          i === 0 ? label : `${label} – also covers`,
          i === 0 ? options : combinable,
          i === 0 ? blank : 'remove',
          i === 0 ? extraOptions : [],
        ),
      )}
      {adding &&
        sel(
          '',
          (v) => {
            setAdding(false);
            if (v) onChange([...new Set([...parts, v])].join('+'));
          },
          `${label} – add a rotation`,
          combinable.filter((o) => !parts.includes(o.name)),
          'choose…',
          [],
        )}
      {!compact && addBtn}
    </div>
  );

  return compact ? (
    <div className="flex min-w-0 flex-1 items-start gap-0.5">
      {selects}
      {addBtn}
    </div>
  ) : (
    selects
  );
}
