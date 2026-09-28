import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OFF, addDays, formatDateLong, isValidISO, startOfWeek, type DaySchedule, type ResidentDay } from '@shared';
import { api } from '../api';
import { IssueList, Modal, PageHeader, PhoneLink, ResidentName, RotationChip } from '../components/ui';
import { useStore } from '../store';

export function DayPage() {
  const { date: param } = useParams();
  const { data, engine, isAdmin, resById } = useStore();
  const navigate = useNavigate();
  const date = param && isValidISO(param) ? param : data.today;
  const day = engine.day(date);
  const [adjusting, setAdjusting] = useState(false);
  const go = (d: string) => navigate(d === data.today ? '/' : `/day/${d}`);

  const by = (pred: (r: ResidentDay) => boolean) => day.residents.filter(pred);
  const vacation = by((r) => r.status === 'vacation');
  const external = by((r) => r.status === 'external');
  const covering = by((r) => !!r.coveringFor);
  const nextIssues = engine.issues(addDays(data.today, 1), addDays(data.today, 14)).filter((i) => i.severity !== 'info');

  return (
    <div>
      <PageHeader
        title={
          <span>
            {formatDateLong(date)}
            {date === data.today && <span className="ml-2 rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">Today</span>}
          </span>
        }
      >
        <button className="btn" onClick={() => go(addDays(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <input type="date" className="input w-auto" value={date} onChange={(e) => e.target.value && go(e.target.value)} />
        <button className="btn" onClick={() => go(addDays(date, 1))} aria-label="Next day">
          ›
        </button>
        {date !== data.today && (
          <button className="btn" onClick={() => go(data.today)}>
            Today
          </button>
        )}
        <Link className="btn" to={`/week/${startOfWeek(date)}`}>
          Week
        </Link>
      </PageHeader>

      {!day.workingDay && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {day.holiday ? 'Holiday' : 'Weekend'} – rotations are not staffed. Only the on-call resident is shown.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard title="On call today" tone="brand">
          {day.onCall ? <BigResident id={day.onCall} /> : <p className="text-sm text-slate-500">No one assigned</p>}
          <p className="mt-2 text-xs text-slate-500">
            Tomorrow: <ResidentName id={data.calls[addDays(date, 1)]} />
          </p>
        </StatusCard>
        <StatusCard title="Post-call (off)">
          {day.postCall ? (
            <>
              <BigResident id={day.postCall} />
              {day.residents.find((r) => r.residentId === day.postCall)?.coveredBy && (
                <p className="mt-1 text-xs text-slate-600">
                  Replaced by <ResidentName id={day.residents.find((r) => r.residentId === day.postCall)!.coveredBy} />
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Nobody</p>
          )}
        </StatusCard>
        <StatusCard title={`On vacation (${vacation.length})`}>
          {vacation.length === 0 && <p className="text-sm text-slate-500">Nobody</p>}
          <ul className="space-y-1 text-sm">
            {vacation.map((r) => (
              <li key={r.residentId}>
                <ResidentName id={r.residentId} /> <span className="text-xs text-slate-500">({r.monthly})</span>
                {r.coveredBy && (
                  <span className="text-xs text-slate-600">
                    {' '}
                    → covered by <ResidentName id={r.coveredBy} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </StatusCard>
      </div>

      {day.workingDay && (
        <div className="card mt-4">
          <div className="card-title flex items-center justify-between">
            <span>Rotations</span>
            {isAdmin && (
              <button className="btn btn-sm no-print" onClick={() => setAdjusting(true)}>
                Adjust assignments
              </button>
            )}
          </div>
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
            {Object.entries(day.rotations).map(([rot, ids]) => (
              <div key={rot} className="flex gap-3 px-4 py-3 sm:border-b sm:border-slate-100">
                <div className="w-24 shrink-0 pt-0.5">
                  <RotationChip name={rot} />
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  {ids.length === 0 && <span className="text-slate-400">—</span>}
                  {ids.map((id) => {
                    const r = day.residents.find((x) => x.residentId === id)!;
                    return (
                      <div key={id}>
                        <ResidentName id={id} phone />
                        {r.coveringFor && (
                          <div className="text-xs text-slate-500">
                            covering <ResidentName id={r.coveringFor} short /> ({r.monthly === 'Post-Call' ? 'post-call' : 'vacation'})
                          </div>
                        )}
                        {r.manual && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">manual</span>}
                        {r.onCall && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] font-semibold text-brand-800">on call</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {covering.length > 0 && (
          <div className="card">
            <div className="card-title">Who covers whom</div>
            <ul className="divide-y divide-slate-100 text-sm">
              {covering.map((r) => (
                <li key={r.residentId} className="px-4 py-2">
                  <ResidentName id={r.residentId} /> <span className="text-slate-500">({r.monthly})</span> covers <ResidentName id={r.coveringFor} /> on{' '}
                  <RotationChip name={r.assignment} small />
                </li>
              ))}
            </ul>
          </div>
        )}
        {external.length > 0 && (
          <div className="card">
            <div className="card-title">External rotations (not in department)</div>
            <ul className="divide-y divide-slate-100 text-sm">
              {external.map((r) => (
                <li key={r.residentId} className="flex justify-between px-4 py-2">
                  <ResidentName id={r.residentId} phone />
                  <RotationChip name={r.assignment} small />
                </li>
              ))}
            </ul>
          </div>
        )}
        {day.residents.some((r) => r.status === 'unassigned' || (r.status === 'off' && r.manual)) && (
          <div className="card">
            <div className="card-title">Unassigned / off</div>
            <ul className="divide-y divide-slate-100 text-sm">
              {day.residents
                .filter((r) => r.status === 'unassigned' || (r.status === 'off' && r.manual))
                .map((r) => (
                  <li key={r.residentId} className="px-4 py-2">
                    <ResidentName id={r.residentId} /> <span className="text-xs text-slate-500">{r.status}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card mt-4">
        <div className="card-title">Warnings for this day</div>
        {isAdmin && day.coverCandidates.length > 1 && <CoverChooser day={day} />}
        <IssueList issues={day.issues} />
      </div>

      {date === data.today && nextIssues.length > 0 && (
        <div className="card mt-4">
          <div className="card-title">Coming up (next 14 days)</div>
          <IssueList issues={nextIssues.slice(0, 15)} showDate />
          {nextIssues.length > 15 && (
            <Link to="/warnings" className="block px-4 py-2 text-sm text-brand-700 hover:underline">
              See all {nextIssues.length} →
            </Link>
          )}
        </div>
      )}

      {adjusting && <AdjustModal day={day} onClose={() => setAdjusting(false)} />}
      {!resById.size && <p className="mt-4 text-slate-500">No residents yet – add some on the Residents page or import an Excel file.</p>}
    </div>
  );
}

function StatusCard({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'brand' }) {
  return (
    <div className={`card p-4 ${tone === 'brand' ? 'border-brand-600 ring-1 ring-brand-600' : ''}`}>
      <div className="label">{title}</div>
      {children}
    </div>
  );
}

function BigResident({ id }: { id: string }) {
  const { resById } = useStore();
  const r = resById.get(id);
  return (
    <div>
      <div className="text-lg font-semibold">
        <ResidentName id={id} />
      </div>
      {r && (
        <div className="text-sm">
          <span className="text-slate-500">{r.year}</span> · <PhoneLink phone={r.phone} />
        </div>
      )}
    </div>
  );
}

function CoverChooser({ day }: { day: DaySchedule }) {
  const { data, mutate } = useStore();
  const current = data.coverChoices[day.date] ?? '';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-amber-50 px-4 py-2 text-sm">
      <span className="font-medium">Vacation Cover should cover:</span>
      <select
        className="input w-auto"
        value={current}
        onChange={(e) => void mutate(() => api(`/api/cover-choice/${day.date}`, { method: 'PUT', json: { residentId: e.target.value } }))}
      >
        <option value="">Default (earliest vacation)</option>
        {day.coverCandidates.map((id) => {
          const r = day.residents.find((x) => x.residentId === id)!;
          return (
            <option key={id} value={id}>
              {data.residents.find((x) => x.id === id)?.name} – {r.monthly}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function AdjustModal({ day, onClose }: { day: DaySchedule; onClose: () => void }) {
  const { data, mutate, resById } = useStore();
  const overrides = data.overrides[day.date] ?? {};
  const choices = data.rotations.filter((r) => r.kind !== 'special').map((r) => r.name);
  const set = (rid: string, v: string) => mutate(() => api(`/api/overrides/${day.date}/${rid}`, { method: 'PUT', json: { assignment: v } }));
  return (
    <Modal title={`Adjust ${formatDateLong(day.date)}`} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        Manual overrides replace the computed assignment for this day only (e.g. to resolve a post-call or vacation conflict).
      </p>
      <table className="table">
        <tbody>
          {day.residents.map((r) => (
            <tr key={r.residentId}>
              <td>
                <div className="font-medium">{resById.get(r.residentId)?.name}</div>
                <div className="text-xs text-slate-500">
                  {r.monthly ?? 'unassigned'} · {r.status}
                </div>
              </td>
              <td className="w-44">
                <select className="input" value={overrides[r.residentId] ?? ''} onChange={(e) => void set(r.residentId, e.target.value)}>
                  <option value="">Auto ({r.manual ? 'computed' : r.assignment ?? r.status})</option>
                  {choices.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                  <option value={OFF}>Off</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
