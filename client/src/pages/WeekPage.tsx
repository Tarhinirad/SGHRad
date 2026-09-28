import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays, formatDateShort, isValidISO, startOfWeek, type DaySchedule } from '@shared';
import { PageHeader, PrintButton, ResidentName, RotationChip, RotationDot } from '../components/ui';
import { useStore } from '../store';

export function WeekPage() {
  const { date: param } = useParams();
  const { data, engine, isAdmin } = useStore();
  const navigate = useNavigate();
  const start = startOfWeek(param && isValidISO(param) ? param : data.today);
  const days = engine.range(start, addDays(start, 6));
  const rotations = Object.keys(days[0].rotations);
  const go = (d: string) => navigate(`/week/${d}`);

  const row = (label: React.ReactNode, cell: (d: DaySchedule) => React.ReactNode, cls = '') => (
    <tr className={cls}>
      <th className="sticky left-0 z-10 bg-white text-left align-top">{label}</th>
      {days.map((d) => (
        <td key={d.date} className={`min-w-[7.5rem] ${d.workingDay ? '' : 'bg-[#f7f8fa]'} ${d.date === data.today ? 'bg-brand-50' : ''}`}>
          {cell(d)}
        </td>
      ))}
    </tr>
  );

  const names = (ids: string[]) =>
    ids.length === 0 ? (
      <span className="text-muted">—</span>
    ) : (
      <div className="space-y-0.5">
        {ids.map((id) => (
          <div key={id}>
            <ResidentName id={id} short />
          </div>
        ))}
      </div>
    );

  return (
    <div>
      <PageHeader title={`Week of ${formatDateShort(start)}`}>
        <button className="btn" onClick={() => go(addDays(start, -7))}>
          ‹ Prev
        </button>
        <input type="date" className="input w-auto" value={start} onChange={(e) => e.target.value && go(e.target.value)} />
        <button className="btn" onClick={() => go(addDays(start, 7))}>
          Next ›
        </button>
        <button className="btn" onClick={() => go(data.today)}>
          This week
        </button>
        <PrintButton />
      </PageHeader>
      <div className="card print-full overflow-x-auto">
        <table className="table text-xs sm:text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#f7f8fa]">Rotation</th>
              {days.map((d) => (
                <th key={d.date} className={d.workingDay ? '' : 'text-muted'}>
                  <Link to={`/day/${d.date}`} className="hover:underline">
                    {formatDateShort(d.date)}
                  </Link>
                  {d.holiday && <div className="font-normal normal-case">holiday</div>}
                  {isAdmin && d.issues.some((i) => i.severity !== 'info') && <span className="ml-1 text-amber-600" title="Warnings">⚠</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row(
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-brand-700"><span className="h-2 w-2 rounded-full bg-amber-call" />On call</span>,
              (d) => (d.onCall ? <ResidentName id={d.onCall} short /> : <span className="text-muted">—</span>),
              'bg-brand-50/40',
            )}
            {rotations.map((rot) => row(
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-label">
                  <RotationDot name={rot} />
                  {rot}
                </span>, (d) => (d.workingDay ? names(d.rotations[rot] ?? []) : null)))}
            {isAdmin && row(<span className="text-muted">Post-call off</span>, (d) => (d.postCall && d.workingDay ? <ResidentName id={d.postCall} short /> : null))}
            {isAdmin && row(<RotationChip name="Vacation" />, (d) => names(d.residents.filter((r) => r.status === 'vacation').map((r) => r.residentId)))}
            {isAdmin && row(
              <span className="text-muted">Covering</span>,
              (d) => (
                <div className="space-y-0.5 text-[11px] text-muted">
                  {d.residents
                    .filter((r) => r.coveringFor)
                    .map((r) => (
                      <div key={r.residentId}>
                        <ResidentName id={r.residentId} short /> → <ResidentName id={r.coveringFor} short />
                      </div>
                    ))}
                </div>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Weekends and holidays are shaded. Click a date for phone numbers.
      </p>
    </div>
  );
}
