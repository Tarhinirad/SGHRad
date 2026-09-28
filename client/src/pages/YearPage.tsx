import { useState } from 'react';
import { Link } from 'react-router-dom';
import { POST_CALL, VACATION_COVER, monthLabel, type MonthKey } from '@shared';
import { api } from '../api';
import { PageHeader, PrintButton, RotationChip, YearSelect, rotationClass } from '../components/ui';
import { useStore } from '../store';

export function YearPage() {
  const { data, isAdmin, mutate, currentYearStart, yearOf, rotByName, engine } = useStore();
  const [yearStart, setYearStart] = useState(currentYearStart);
  const [showInactive, setShowInactive] = useState(false);
  const { months } = yearOf(yearStart);
  const residents = data.residents.filter((r) => r.active || showInactive);
  const options = data.rotations.filter((r) => r.monthly);
  const currentMonth = data.today.slice(0, 7);

  const set = (residentId: string, month: MonthKey, value: string) =>
    mutate(() => api('/api/monthly', { method: 'PUT', json: { residentId, month, value } }));

  const count = (m: MonthKey, role: string) => data.residents.filter((r) => r.active && data.monthly[r.id]?.[m] === role).length;

  return (
    <div>
      <PageHeader title="Monthly schedule">
        <YearSelect value={yearStart} onChange={setYearStart} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactive
        </label>
        <PrintButton />
      </PageHeader>
      <div className="card print-full overflow-x-auto">
        <table className="table text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50">Resident</th>
              {months.map((m) => (
                <th key={m} className={`text-center ${m === currentMonth ? 'bg-brand-100 text-brand-900' : ''}`}>
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white">
                  <Link to={`/residents/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-[10px] text-slate-500">
                    {r.id} · {r.year}
                  </div>
                </td>
                {months.map((m) => {
                  const v = data.monthly[r.id]?.[m] ?? '';
                  const unknown = v && !rotByName.has(v);
                  return (
                    <td key={m} className="p-1 text-center">
                      {isAdmin ? (
                        <select
                          className={`w-full min-w-[6.5rem] rounded border px-1 py-1 text-xs print:appearance-none ${rotationClass(v, rotByName.get(v)?.kind)} ${unknown ? 'ring-2 ring-red-500' : ''}`}
                          value={v}
                          onChange={(e) => void set(r.id, m, e.target.value)}
                          aria-label={`${r.name} ${monthLabel(m)}`}
                        >
                          <option value="">—</option>
                          {options.map((o) => (
                            <option key={o.name} value={o.name}>
                              {o.name}
                            </option>
                          ))}
                          {unknown && <option value={v}>{v} (unknown)</option>}
                        </select>
                      ) : (
                        <RotationChip name={v || null} small />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {[VACATION_COVER, POST_CALL].map((role) => (
              <tr key={role}>
                <td className="sticky left-0 z-10 bg-white text-[11px] font-semibold">{role}</td>
                {months.map((m) => {
                  const n = count(m, role);
                  return (
                    <td key={m} className={`text-center text-[11px] ${n === 0 ? 'bg-red-50 font-semibold text-red-700' : 'text-slate-500'}`}>
                      {n === 0 ? 'missing' : n}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-white text-[11px] font-semibold">Warnings</td>
              {months.map((m) => {
                const n = engine.monthIssues(m).filter((i) => i.severity !== 'info').length;
                return (
                  <td key={m} className={`text-center text-[11px] ${n ? 'text-amber-700' : 'text-slate-400'}`}>
                    {n || '✓'}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Each cell is the resident's assignment for the month. Mammography is not assigned monthly – it is where the Vacation Cover resident goes when
        nobody is on vacation.
      </p>
    </div>
  );
}
