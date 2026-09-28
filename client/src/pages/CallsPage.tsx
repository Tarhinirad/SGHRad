import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, addMonths, daysInRange, firstOfMonth, formatDateLong, lastOfMonth, monthLabel, startOfWeek, weekday } from '@shared';
import { api } from '../api';
import { IssueList, Modal, PageHeader, PrintButton, ResidentName, shortName } from '../components/ui';
import { useStore } from '../store';

const CALL_CODES = new Set(['vacation-and-call', 'consecutive-calls', 'external-on-call', 'inactive-on-call', 'unknown-resident']);

export function CallsPage() {
  const { data, engine, isAdmin, resById, yearOf, currentYearStart } = useStore();
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const [editing, setEditing] = useState<string | null>(null);
  const from = firstOfMonth(month);
  const to = lastOfMonth(month);
  const gridStart = startOfWeek(from);
  const gridEnd = addDays(startOfWeek(to), 6);
  const cells = daysInRange(gridStart, gridEnd);

  // Call counts: this month and academic year (fairness overview)
  const { from: yFrom, to: yTo } = yearOf(currentYearStart);
  const counts = new Map<string, { month: number; year: number; weekend: number }>();
  for (const [d, id] of Object.entries(data.calls)) {
    const c = counts.get(id) ?? { month: 0, year: 0, weekend: 0 };
    if (d >= from && d <= to) c.month++;
    if (d >= yFrom && d <= yTo) {
      c.year++;
      if (!engine.isWorkingDay(d)) c.weekend++;
    }
    counts.set(id, c);
  }
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

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="card-title">Call problems this month</div>
          <IssueList issues={monthIssues} showDate empty="No call conflicts this month." />
        </div>
        <div className="card overflow-x-auto">
          <div className="card-title">Call counts</div>
          <table className="table">
            <thead>
              <tr>
                <th>Resident</th>
                <th className="text-right">{monthLabel(month)}</th>
                <th className="text-right">Academic year</th>
                <th className="text-right">Weekend/holiday</th>
              </tr>
            </thead>
            <tbody>
              {data.residents
                .filter((r) => r.active)
                .map((r) => {
                  const c = counts.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td>
                        <ResidentName id={r.id} />
                      </td>
                      <td className="text-right">{c?.month ?? 0}</td>
                      <td className="text-right">{c?.year ?? 0}</td>
                      <td className="text-right">{c?.weekend ?? 0}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
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
