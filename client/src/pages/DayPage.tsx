import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OFF, addDays, formatDateLong, isValidISO, parseISO, startOfWeek, type DaySchedule, type ResidentDay } from '@shared';
import { api } from '../api';
import { Avatar, Icon, IssueList, Modal, PageHeader, PhoneLink, ResidentName, RotationChip, rotationAccent, telHref } from '../components/ui';
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

  const dt = parseISO(date);
  const weekdayName = dt.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const dateTitle = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const staffed = Object.values(day.rotations).reduce((n, ids) => n + ids.length, 0);

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            {weekdayName}
            {date === data.today && <span className="rounded-full bg-brand-100 px-2.5 py-0.5 tracking-normal text-brand-700 normal-case">Today</span>}
          </>
        }
        title={dateTitle}
      >
        <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(14,26,51,0.05)]">
          <button className="flex h-11 w-11 items-center justify-center rounded-l-xl hover:bg-slate-50" onClick={() => go(addDays(date, -1))} aria-label="Previous day">
            <Icon name="left" className="h-[18px] w-[18px]" />
          </button>
          <label className="flex h-11 items-center gap-2 border-x border-slate-100 px-3 text-sm font-semibold">
            <Icon name="calendar" className="h-4 w-4 text-slate-500" />
            <span className="sr-only">Pick a date</span>
            <input type="date" className="bg-transparent outline-none" value={date} onChange={(e) => e.target.value && go(e.target.value)} />
          </label>
          <button className="flex h-11 w-11 items-center justify-center rounded-r-xl hover:bg-slate-50" onClick={() => go(addDays(date, 1))} aria-label="Next day">
            <Icon name="right" className="h-[18px] w-[18px]" />
          </button>
        </div>
        {date !== data.today && (
          <button className="btn min-h-11" onClick={() => go(data.today)}>
            Today
          </button>
        )}
        <Link className="btn min-h-11" to={`/week/${startOfWeek(date)}`}>
          <Icon name="week" /> Week view
        </Link>
      </PageHeader>

      {!day.workingDay && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-600">
          <span className="font-semibold text-brand-950">{day.holiday ? 'Holiday' : 'Weekend'}</span> – rotations are not staffed. Only the on-call resident is shown.
        </div>
      )}

      <OnCallHero date={date} />

      {isAdmin && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <StatusCard title="Post-call (off)">
            {day.postCall ? (
              <>
                <BigResident id={day.postCall} />
                {day.residents.find((r) => r.residentId === day.postCall)?.coveredBy && (
                  <p className="mt-2 text-xs text-slate-600">
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
            <ul className="space-y-1.5 text-sm">
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
      )}

      {day.workingDay && (
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Rotations</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                {Object.keys(day.rotations).length} services · {staffed} {staffed === 1 ? 'resident' : 'residents'}
              </span>
              {isAdmin && (
                <button className="btn btn-sm no-print" onClick={() => setAdjusting(true)}>
                  Adjust assignments
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {Object.entries(day.rotations).map(([rot, ids]) => {
              const accent = rotationAccent(rot);
              return (
                <div key={rot} className="card flex flex-col sm:min-h-[9rem] gap-3.5 p-5">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`} />
                    <span className="flex-1 text-[13px] font-bold uppercase tracking-[0.08em] text-slate-600">{rot}</span>
                    {ids.length > 0 && (
                      <span className="text-xs font-semibold text-slate-500">
                        {ids.length} {ids.length === 1 ? 'resident' : 'residents'}
                      </span>
                    )}
                  </div>
                  {ids.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 py-3 text-sm text-slate-500">
                      Unstaffed today
                    </div>
                  )}
                  {ids.map((id) => {
                    const r = day.residents.find((x) => x.residentId === id)!;
                    const res = resById.get(id);
                    return (
                      <div key={id} className="flex items-start gap-3">
                        <Avatar name={res?.name ?? id} className={accent.avatar} />
                        <div className="min-w-0 flex-1 text-sm">
                          <div className="flex flex-wrap items-center gap-1.5 text-[15px]">
                            <ResidentName id={id} />
                            {r.onCall && <span className="rounded-full bg-oncall/20 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-amber-900">on call</span>}
                            {isAdmin && r.manual && <span className="rounded-full bg-slate-100 px-2 py-px text-[10px] font-semibold text-slate-600">manual</span>}
                          </div>
                          <PhoneLink phone={res?.phone} className="text-[13px]" />
                          {isAdmin && r.coveringFor && (
                            <div className="text-xs text-slate-500">
                              covering <ResidentName id={r.coveringFor} short /> ({r.monthly === 'Post-Call' ? 'post-call' : 'vacation'})
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isAdmin && (
      <>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {covering.length > 0 && (
          <div className="card">
            <div className="card-title">Who covers whom</div>
            <ul className="divide-y divide-slate-100 text-sm">
              {covering.map((r) => (
                <li key={r.residentId} className="px-5 py-2.5">
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
                <li key={r.residentId} className="flex justify-between px-5 py-2.5">
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
                  <li key={r.residentId} className="px-5 py-2.5">
                    <ResidentName id={r.residentId} /> <span className="text-xs text-slate-500">{r.status}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card mt-6">
        <div className="card-title">Warnings for this day</div>
        {isAdmin && day.coverCandidates.length > 1 && <CoverChooser day={day} />}
        <IssueList issues={day.issues} />
      </div>

      {date === data.today && nextIssues.length > 0 && (
        <div className="card mt-6">
          <div className="card-title">Coming up (next 14 days)</div>
          <IssueList issues={nextIssues.slice(0, 15)} showDate />
          {nextIssues.length > 15 && (
            <Link to="/warnings" className="block px-5 py-3 text-sm font-semibold text-brand-700 hover:underline">
              See all {nextIssues.length} →
            </Link>
          )}
        </div>
      )}
      </>
      )}

      {adjusting && <AdjustModal day={day} onClose={() => setAdjusting(false)} />}
      {!resById.size && <p className="mt-4 text-slate-500">No residents yet – add some on the Residents page or import an Excel file.</p>}
    </div>
  );
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="label">{title}</div>
      {children}
    </div>
  );
}

function OnCallHero({ date }: { date: string }) {
  const { data, engine, resById } = useStore();
  const id = engine.day(date).onCall;
  const r = id ? resById.get(id) : undefined;
  const tomorrow = data.calls[addDays(date, 1)];
  return (
    <section className="flex flex-col gap-5 rounded-[20px] bg-brand-900 p-5 text-white shadow-[0_12px_32px_-16px_rgba(14,26,51,0.6)] sm:flex-row sm:items-center sm:gap-7 sm:px-8 sm:py-7">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-oncall/15 text-oncall sm:flex">
          <Icon name="bell" className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-oncall">
            <span className="h-2 w-2 rounded-full bg-oncall" />
            On call today
          </div>
          {r ? (
            <>
              <div className="mt-1 truncate font-display text-2xl font-semibold sm:text-3xl">{r.name}</div>
              <div className="text-sm text-slate-300">{r.year}</div>
            </>
          ) : (
            <div className="mt-1 font-display text-2xl font-medium text-slate-300 sm:text-3xl">{id ?? 'No one assigned'}</div>
          )}
        </div>
      </div>
      {r?.phone && (
        <a
          href={telHref(r.phone)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-oncall px-5 text-[15px] font-bold text-amber-950 hover:bg-amber-300"
        >
          <Icon name="phone" className="h-[18px] w-[18px]" /> {r.phone}
        </a>
      )}
      <div className="flex items-center justify-between gap-4 border-t border-white/15 pt-4 sm:w-56 sm:flex-col sm:items-start sm:gap-1 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">Tomorrow</span>
        <span className="text-base font-semibold">{tomorrow ? resById.get(tomorrow)?.name ?? tomorrow : '—'}</span>
      </div>
    </section>
  );
}

function BigResident({ id }: { id: string }) {
  const { resById } = useStore();
  const r = resById.get(id);
  return (
    <div className="flex items-center gap-3">
      <Avatar name={r?.name ?? id} />
      <div>
        <div className="text-base font-semibold">
          <ResidentName id={id} />
        </div>
        {r && (
          <div className="text-sm">
            <span className="text-slate-500">{r.year}</span> · <PhoneLink phone={r.phone} />
          </div>
        )}
      </div>
    </div>
  );
}

function CoverChooser({ day }: { day: DaySchedule }) {
  const { data, mutate } = useStore();
  const current = data.coverChoices[day.date] ?? '';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-amber-50 px-5 py-2.5 text-sm">
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
