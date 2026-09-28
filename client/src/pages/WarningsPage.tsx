import { useMemo, useState } from 'react';
import type { IssueCode, Severity } from '@shared';
import { IssueList, PageHeader, SeverityBadge, YearSelect } from '../components/ui';
import { useStore } from '../store';

const LABELS: Record<IssueCode, string> = {
  'rotation-over-capacity': 'Rotation above capacity',
  'rotation-empty': 'Rotation empty',
  'vacation-and-call': 'On call while on vacation',
  'consecutive-calls': 'Consecutive calls',
  'no-vacation-cover': 'No Vacation Cover in month',
  'no-post-call': 'No Post-Call in month',
  'vacation-cover-conflict': 'More vacations than cover',
  'vacation-uncovered': 'Vacation not covered',
  'post-call-external': 'Post-call after external rotation',
  'post-call-on-vacation': 'Post-call resident on vacation',
  'post-call-self': 'Post-Call resident was on call',
  'post-call-uncovered': 'Post-call not replaced',
  'external-on-call': 'External resident on call',
  'inactive-on-call': 'Inactive resident on call',
  'unknown-resident': 'Unknown resident',
  'unknown-rotation': 'Unknown rotation value',
  unassigned: 'Resident without assignment',
  'no-call': 'Day without on-call',
};

export function WarningsPage() {
  const { data, engine, currentYearStart, yearOf } = useStore();
  const [yearStart, setYearStart] = useState(currentYearStart);
  const [scope, setScope] = useState<'upcoming' | 'year'>('upcoming');
  const [severity, setSeverity] = useState<Severity | 'all-but-info'>('all-but-info');
  const [code, setCode] = useState<IssueCode | ''>('');
  const { from, to } = yearOf(yearStart);

  const all = useMemo(() => {
    const start = scope === 'upcoming' && data.today > from ? data.today : from;
    return start > to ? [] : engine.issues(start, to);
  }, [engine, from, to, scope, data.today]);

  const bySeverity = all.filter((i) => (severity === 'all-but-info' ? i.severity !== 'info' : i.severity === severity));
  const shown = bySeverity.filter((i) => !code || i.code === code);
  const groups = new Map<IssueCode, { n: number; severity: Severity }>();
  for (const i of bySeverity) groups.set(i.code, { n: (groups.get(i.code)?.n ?? 0) + 1, severity: i.severity });

  return (
    <div>
      <PageHeader title="Warnings dashboard">
        <YearSelect value={yearStart} onChange={setYearStart} />
        <select className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value as 'upcoming' | 'year')}>
          <option value="upcoming">From today</option>
          <option value="year">Whole academic year</option>
        </select>
        <select className="input w-auto" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
          <option value="all-but-info">Errors & warnings</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings only</option>
          <option value="info">Info only</option>
        </select>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {[...groups.entries()]
          .sort((a, b) => b[1].n - a[1].n)
          .map(([c, g]) => (
            <button
              key={c}
              onClick={() => setCode(code === c ? '' : c)}
              className={`card flex items-center justify-between gap-2 p-3 text-left ${code === c ? 'ring-2 ring-brand-600' : 'hover:bg-[#f7f8fa]'}`}
            >
              <div>
                <div className="text-sm font-medium">{LABELS[c]}</div>
                <SeverityBadge severity={g.severity} />
              </div>
              <div className="text-2xl font-bold text-navy-ink">{g.n}</div>
            </button>
          ))}
        {groups.size === 0 && <div className="card col-span-full p-4 text-sm text-green-700">✓ No problems found.</div>}
      </div>

      <div className="card">
        <div className="card-title">
          {code ? LABELS[code] : 'All'} ({shown.length})
          {code && (
            <button className="ml-2 text-xs text-brand-700" onClick={() => setCode('')}>
              clear filter
            </button>
          )}
        </div>
        <IssueList issues={shown.slice(0, 500)} showDate />
        {shown.length > 500 && <p className="px-4 py-2 text-xs text-muted">Showing the first 500.</p>}
      </div>
      <p className="mt-2 text-xs text-muted">
        “Resolvable” warnings can be fixed for a single day from the day view: choose whom the Vacation Cover covers, or use “Adjust assignments”.
      </p>
    </div>
  );
}
