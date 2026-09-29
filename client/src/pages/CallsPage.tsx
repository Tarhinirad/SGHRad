import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CALL_TYPES, MEDALS, addDays, addMonths, callStats, daysInRange, firstOfMonth, formatDateLong, lastOfMonth, monthLabel, startOfWeek, weekday, type CallType, type MedalKind } from '@shared';
import { api } from '../api';
import { IssueList, Modal, PageHeader, PrintButton, ResidentName, shortName } from '../components/ui';
import { useStore } from '../store';

const CALL_CODES = new Set(['vacation-and-call', 'consecutive-calls', 'external-on-call', 'inactive-on-call', 'unknown-resident']);

export function CallsPage() {
  const { data, engine, isAdmin, resById } = useStore();
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const [editing, setEditing] = useState<string | null>(null);
  const from = firstOfMonth(month);
  const to = lastOfMonth(month);
  const gridStart = startOfWeek(from);
  const gridEnd = addDays(startOfWeek(to), 6);
  const cells = daysInRange(gridStart, gridEnd);

  const monthIssues = engine
    .issues(from, to)
    .filter((i) => i.date && CALL_CODES.has(i.code));

  return (
    <div>
      <PageHeader title={`Call calendar – ${monthLabel(month)}`}>
        <button className="btn" onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <input type="month" className="input w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <button className="btn" onClick={() => setMonth(addMonths(month, 1))}>
          ›
        </button>
        <PrintButton />
      </PageHeader>

      <div className="card print-full overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-[#f7f8fa] text-center text-[11px] font-semibold uppercase text-muted">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const inMonth = d >= from && d <= to;
            const id = data.calls[d];
            const r = id ? resById.get(id) : undefined;
            const problems = inMonth ? engine.day(d).issues.filter((i) => CALL_CODES.has(i.code)) : [];
            const wk = weekday(d) === 0 || weekday(d) === 6 || data.settings.holidays.includes(d);
            return (
              <button
                key={d}
                disabled={!inMonth || !isAdmin}
                onClick={() => setEditing(d)}
                className={`min-h-16 border-b border-r border-line p-1 text-left align-top sm:min-h-20 sm:p-1.5 ${
                  inMonth ? (wk ? 'bg-[#f7f8fa]' : 'bg-white') : 'bg-[#eef0f4] text-muted'
                } ${d === data.today ? 'ring-2 ring-inset ring-brand-600' : ''} ${isAdmin && inMonth ? 'hover:bg-brand-50' : ''}`}
                title={problems.map((p) => p.message).join('\n')}
              >
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>{Number(d.slice(8))}</span>
                  {problems.length > 0 && <span className="text-amber-600">⚠</span>}
                </div>
                {inMonth && (
                  <div className={`mt-0.5 text-[11px] font-medium leading-tight sm:text-xs ${r ? 'text-navy-ink' : 'text-red-400'}`}>
                    {r ? (
                      <>
                        <span className="sm:hidden">{r.name.split(' ').map((p) => p[0]).join('')}</span>
                        <span className="hidden sm:inline">{shortName(r.name)}</span>
                      </>
                    ) : id ? (
                      id
                    ) : (
                      '—'
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${isAdmin ? 'lg:grid-cols-2' : ''}`}>
        <div className="card">
          <div className="card-title">Call problems this month</div>
          <IssueList issues={monthIssues} showDate empty="No call conflicts this month." />
        </div>
        {isAdmin && <CallCounts month={month} />}
      </div>

      {editing && <CallEditor date={editing} onClose={() => setEditing(null)} onNavigate={setEditing} />}
    </div>
  );
}

function CallEditor({ date, onClose, onNavigate }: { date: string; onClose: () => void; onNavigate: (d: string) => void }) {
  const { data, engine, mutate } = useStore();
  const current = data.calls[date] ?? '';
  const prev = data.calls[addDays(date, -1)];
  const next = data.calls[addDays(date, 1)];
  const day = engine.day(date);

  const note = (id: string): string[] => {
    const out: string[] = [];
    const rd = day.residents.find((r) => r.residentId === id);
    if (engine.vacationOn(id, date)) out.push('on vacation');
    if (engine.vacationOn(id, addDays(date, 1))) out.push('vacation tomorrow');
    if (id === prev) out.push('on call yesterday');
    if (id === next) out.push('on call tomorrow');
    if (rd?.status === 'external') out.push(`external (${rd.monthly})`);
    if (rd?.monthly === 'Post-Call') out.push('Post-Call resident');
    return out;
  };

  const save = async (id: string) => {
    const ok = await mutate(() => api(`/api/calls/${date}`, { method: 'PUT', json: { residentId: id } }));
    if (ok) onClose();
  };

  return (
    <Modal title={`On call – ${formatDateLong(date)}`} onClose={onClose}>
      <div className="mb-3 flex justify-between text-sm">
        <button className="btn btn-sm" onClick={() => onNavigate(addDays(date, -1))}>
          ‹ Previous day
        </button>
        <Link to={`/day/${date}`} className="text-brand-700 hover:underline">
          Day view
        </Link>
        <button className="btn btn-sm" onClick={() => onNavigate(addDays(date, 1))}>
          Next day ›
        </button>
      </div>
      <ul className="divide-y divide-line rounded border border-line">
        {data.residents
          .filter((r) => r.active)
          .map((r) => {
            const n = note(r.id);
            const bad = n.includes('on vacation');
            return (
              <li key={r.id}>
                <button
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 ${r.id === current ? 'bg-brand-100 font-semibold' : ''}`}
                  onClick={() => void save(r.id)}
                >
                  <span>
                    {r.name} <span className="text-xs text-muted">{r.year}</span>
                  </span>
                  <span className={`text-right text-[11px] ${bad ? 'font-semibold text-red-600' : 'text-amber-700'}`}>{n.join(' · ')}</span>
                </button>
              </li>
            );
          })}
      </ul>
      {current && (
        <button className="btn btn-danger mt-3" onClick={() => void save('')}>
          Clear on-call
        </button>
      )}
    </Modal>
  );
}

const TYPE_LABEL: Record<CallType, { label: string; hint: string }> = {
  weekday: { label: 'Mon–Wed', hint: 'Weekday; post-call is an ordinary working day' },
  thursday: { label: 'Thu', hint: 'Post-call day opens onto the weekend' },
  friday: { label: 'Fri', hint: 'Working day, but the post-call day is already off' },
  saturday: { label: 'Sat', hint: 'Weekend day; the next day is off too (no post-call benefit)' },
  sunday: { label: 'Sun', hint: 'Weekend day followed by a working day (post-call benefit)' },
};

const MEDAL_LABEL: Record<MedalKind, { label: string; hint: string; cls: string }> = {
  bronze: { label: 'Bronze', hint: 'Friday call; Saturday and Sunday off', cls: 'bg-[#f3e1d0] text-[#7a4a1d]' },
  silver: { label: 'Silver', hint: 'No call on Friday, Saturday or Sunday', cls: 'bg-[#e8ebf0] text-[#4a5568]' },
  golden: { label: 'Golden', hint: 'Post-call on Friday; no call Saturday or Sunday', cls: 'bg-[#fbeeb8] text-[#7a5a00]' },
  diamond: { label: 'Diamond', hint: 'Golden plus Monday off, or Friday off with Thursday post-call', cls: 'bg-[#d7ecfb] text-[#0d5a8f]' },
};

/** First month (YYYY-MM) of the calendar trimester containing `month`. */
function trimesterOf(month: string) {
  const m = Number(month.slice(5, 7));
  return `${month.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, '0')}`;
}

/** Admin-only: call counts by type (with equivalents when days are off) and weekend medals. */
function CallCounts({ month }: { month: string }) {
  const { data, engine } = useStore();
  // Calendar trimesters: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. Starts on the trimester of the month shown above.
  const [tri, setTri] = useState(() => trimesterOf(month));
  useEffect(() => setTri(trimesterOf(month)), [month]);
  const from = firstOfMonth(tri);
  const to = lastOfMonth(addMonths(tri, 2));
  const triLabel = `${monthLabel(tri).slice(0, 3)}–${monthLabel(addMonths(tri, 2)).slice(0, 3)} ${tri.slice(0, 4)}`;
  const residents = data.residents.filter((r) => r.active);
  const stats = callStats(
    residents.map((r) => r.id),
    from,
    to,
    { calls: data.calls, isWorking: (d) => engine.isWorkingDay(d), onVacation: (id, d) => !!engine.vacationOn(id, d) },
  );

  return (
    <div className="card overflow-x-auto lg:col-span-2">
      <div className="card-title flex flex-wrap items-center justify-between gap-2">
        <span>Call counts · trimester</span>
        <span className="flex items-center gap-1 font-sans text-sm">
          <button className="btn btn-sm" aria-label="Previous trimester" onClick={() => setTri(addMonths(tri, -3))}>
            ‹
          </button>
          <span className="min-w-28 text-center font-semibold">{triLabel}</span>
          <button className="btn btn-sm" aria-label="Next trimester" onClick={() => setTri(addMonths(tri, 3))}>
            ›
          </button>
        </span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Resident</th>
            <th className="text-right">Total</th>
            <th className="text-right" title="Calls on weekends and holidays">
              Off days
            </th>
            {CALL_TYPES.map((t) => (
              <th key={t} className="text-right" title={TYPE_LABEL[t].hint}>
                {TYPE_LABEL[t].label}
              </th>
            ))}
            {MEDALS.map((k) => (
              <th key={k} className="text-right" title={MEDAL_LABEL[k].hint}>
                {MEDAL_LABEL[k].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {residents.map((r) => {
            const c = stats.get(r.id)!;
            return (
              <tr key={r.id}>
                <td>
                  <ResidentName id={r.id} />
                </td>
                <td className="text-right font-semibold">{c.total}</td>
                <td className="text-right">{c.offDays}</td>
                {CALL_TYPES.map((t) => (
                  <td key={t} className="text-right">
                    {c.byType[t]}
                  </td>
                ))}
                {MEDALS.map((k) => (
                  <td key={k} className="text-right">
                    {c.medals[k] ? <span className={`pill px-2 ${MEDAL_LABEL[k].cls}`}>{c.medals[k]}</span> : <span className="text-muted">0</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="space-y-1 border-t border-line px-5 py-3 text-xs text-muted">
        <p>
          <b>Mon–Wed</b> weekday · <b>Thu</b> post-call opens onto the weekend · <b>Fri</b> weekday with no post-call benefit · <b>Sat</b> weekend, no
          post-call benefit · <b>Sun</b> weekend with post-call. When a day is off (holiday or non-working day), calls count as the equivalent: with Friday off,
          a Friday call counts as a Sat, a Thursday call as a Fri, and a Wednesday call as a Thu.
        </p>
        <p>
          <b>Weekends</b> (Saturday within the trimester, only when Friday, Saturday and Sunday calls are all filled in; residents on vacation are skipped):{' '}
          <b>Bronze</b> Friday call, Sat and Sun off · <b>Silver</b> no call Fri, Sat or Sun · <b>Golden</b> post-call on Friday, no call Sat or Sun ·{' '}
          <b>Diamond</b> golden plus Monday off, or Friday off with Thursday post-call.
        </p>
      </div>
    </div>
  );
}
