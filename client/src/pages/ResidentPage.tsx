import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { daysInRange, diffDays, firstOfMonth, formatDateShort, lastOfMonth, monthLabel, type ResidentDay } from '@shared';
import { PageHeader, PhoneLink, PrintButton, ResidentName, RotationChip, YearSelect } from '../components/ui';
import { useStore } from '../store';

function describe(d: ResidentDay | undefined): { label: string | null; note?: string } {
  if (!d) return { label: null };
  switch (d.status) {
    case 'vacation':
      return { label: 'Vacation' };
    case 'post-call':
      return { label: 'Off', note: 'post-call' };
    case 'off':
      return { label: 'Off', note: d.manual ? 'manual' : undefined };
    case 'unassigned':
      return { label: null };
    default:
      return { label: d.assignment, note: d.coveringFor ? 'covering' : d.manual ? 'manual' : undefined };
  }
}

export function ResidentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, engine, resById, currentYearStart, yearOf } = useStore();
  const [yearStart, setYearStart] = useState(currentYearStart);
  const { months, from, to } = yearOf(yearStart);
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const resident = id ? resById.get(id) : undefined;

  const picker = (
    <select className="input w-auto" value={id ?? ''} onChange={(e) => navigate(`/residents/${e.target.value}`)}>
      <option value="">Select resident…</option>
      {data.residents.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name} ({r.year})
        </option>
      ))}
    </select>
  );

  if (!resident) return <PageHeader title="Resident">{picker}</PageHeader>;

  const calls = Object.entries(data.calls)
    .filter(([d, rid]) => rid === resident.id && d >= from && d <= to)
    .map(([d]) => d)
    .sort();
  const upcomingCalls = calls.filter((d) => d >= data.today);
  const vacations = data.vacations.filter((v) => v.residentId === resident.id && v.end >= from && v.start <= to);
  const selMonth = months.includes(month) ? month : months[0];
  const monthDays = daysInRange(firstOfMonth(selMonth), lastOfMonth(selMonth));
  const issues = engine.issues(from, to).filter((i) => i.residentIds?.includes(resident.id) && i.severity !== 'info');

  return (
    <div>
      <PageHeader title={resident.name}>
        {picker}
        <YearSelect value={yearStart} onChange={setYearStart} />
        <PrintButton />
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted">ID</span> {resident.id}
        </span>
        <span>
          <span className="text-muted">Year</span> {resident.year}
        </span>
        <PhoneLink phone={resident.phone} />
        {!resident.active && <span className="rounded bg-[#e6e9ef] px-2 text-xs">inactive</span>}
      </div>

      <div className="card mb-4">
        <div className="card-title">Year schedule (click a month for daily detail)</div>
        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6">
          {months.map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`rounded border p-2 text-left ${m === selMonth ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line hover:bg-[#f7f8fa]'}`}
            >
              <div className="text-[11px] text-muted">{monthLabel(m)}</div>
              <RotationChip name={data.monthly[resident.id]?.[m] ?? null} small />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-title">{monthLabel(selMonth)} – day by day</div>
          <div className="max-h-[32rem] overflow-y-auto print-full">
            <table className="table">
              <tbody>
                {monthDays.map((d) => {
                  const day = engine.day(d);
                  const rd = day.residents.find((r) => r.residentId === resident.id);
                  const { label, note } = describe(rd);
                  return (
                    <tr key={d} className={`${day.workingDay ? '' : 'bg-[#f7f8fa] text-muted'} ${d === data.today ? 'bg-brand-50' : ''}`}>
                      <td className="w-32 whitespace-nowrap">
                        <Link to={`/day/${d}`} className="hover:underline">
                          {formatDateShort(d)}
                        </Link>
                      </td>
                      <td>
                        {day.workingDay || rd?.status === 'vacation' || rd?.status === 'external' ? <RotationChip name={label} small /> : null}
                        {note && <span className="ml-2 text-xs text-muted">{note}</span>}
                        {rd?.coveringFor && (
                          <span className="ml-1 text-xs text-muted">
                            for <ResidentName id={rd.coveringFor} short />
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {data.calls[d] === resident.id && <span className="rounded bg-brand-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">ON CALL</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <div className="card-title">
              Calls ({calls.length} this year, {upcomingCalls.length} upcoming)
            </div>
            <div className="flex flex-wrap gap-1 p-3 text-xs">
              {upcomingCalls.slice(0, 30).map((d) => (
                <Link key={d} to={`/day/${d}`} className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-800 hover:underline">
                  {formatDateShort(d)}
                </Link>
              ))}
              {upcomingCalls.length === 0 && <span className="text-muted">No upcoming calls.</span>}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Vacations</div>
            <ul className="divide-y divide-line text-sm">
              {vacations.length === 0 && <li className="px-4 py-2 text-muted">None this year.</li>}
              {vacations.map((v) => (
                <li key={v.id} className="px-4 py-2">
                  {formatDateShort(v.start)} → {formatDateShort(v.end)} <span className="text-xs text-muted">({diffDays(v.start, v.end) + 1} d)</span>
                  {v.notes && <div className="text-xs text-muted">{v.notes}</div>}
                </li>
              ))}
            </ul>
          </div>
          {issues.length > 0 && (
            <div className="card">
              <div className="card-title">Warnings involving {resident.name.split(' ')[0]}</div>
              <ul className="divide-y divide-line text-xs">
                {issues.slice(0, 20).map((i, n) => (
                  <li key={n} className="px-4 py-1.5">
                    {i.date && (
                      <Link to={`/day/${i.date}`} className="mr-1 font-medium text-brand-700">
                        {formatDateShort(i.date)}
                      </Link>
                    )}
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
