import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OFF, addDays, formatDateLong, isValidISO, onCallAt, parseISO, startOfWeek, type DaySchedule, type ResidentDay } from '@shared';
import { hourLabel, useClock } from '../clock';
import { api } from '../api';
import { BellIcon, CalendarIcon, ChevronLeft, ChevronRight, MenuIcon, WhatsAppIcon } from '../components/icons';
import { ComboSelect, IssueList, Modal, ResidentName, RotationChip, RotationDot, initials, rotationColors, whatsappHref } from '../components/ui';
import { useStore } from '../store';

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parseISO(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });

export function DayPage() {
  const { date: param } = useParams();
  const { data, engine, isAdmin, resById, rotByName } = useStore();
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
  // A call listed for date D runs from D at callStartHour (08:00) to D+1 at 08:00, so on the
  // current day, before 08:00, the previous day's resident is still the one on call.
  const clock = useClock(data.timeZone);
  const start = data.settings.callStartHour ?? 8;
  const isNow = date === clock.date;
  const shift = onCallAt(data.calls, date, isNow ? clock.hour : start, start);
  const onCall = shift.current ? resById.get(shift.current) : undefined;
  const callLabel = isNow ? 'On call now' : 'On call';
  const callWhen = isNow
    ? shift.currentSince < date
      ? `Since yesterday ${hourLabel(start)} · until ${hourLabel(start)}`
      : `From ${hourLabel(start)} today`
    : `From ${hourLabel(start)}`;
  // Mammography is not shown on the daily view.
  const rotations = Object.entries(day.rotations).filter(([name]) => name !== 'Mammography');
  const staffed = new Set(rotations.flatMap(([, ids]) => ids)).size;

  return (
    <div className="flex flex-col gap-6 lg:gap-7">
      {/* Title + date stepper */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="eyebrow">{fmt(date, { weekday: 'long' })}</span>
            {date === data.today && <span className="pill">Today</span>}
            {!day.workingDay && <span className="pill bg-[#eef0f4] text-muted">{day.holiday ? 'Holiday' : 'Weekend'}</span>}
          </div>
          <h1 className="m-0 text-[32px] font-semibold leading-tight md:text-[44px]">{fmt(date, { day: 'numeric', month: 'long', year: 'numeric' })}</h1>
        </div>
        <div className="no-print flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-line-strong bg-white shadow-[0_1px_2px_rgba(14,26,51,0.05)] md:flex-none">
            <button className="icon-btn text-navy-ink hover:bg-brand-50" onClick={() => go(addDays(date, -1))} aria-label="Previous day">
              <ChevronLeft />
            </button>
            <label className="relative flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 border-x border-[#eceff4] px-3.5 text-sm font-semibold">
              <CalendarIcon className="text-muted" />
              <span className="whitespace-nowrap sm:hidden">{fmt(date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="hidden whitespace-nowrap sm:inline">{fmt(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <input
                type="date"
                aria-label="Pick a date"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={date}
                onChange={(e) => e.target.value && go(e.target.value)}
              />
            </label>
            <button className="icon-btn text-navy-ink hover:bg-brand-50" onClick={() => go(addDays(date, 1))} aria-label="Next day">
              <ChevronRight />
            </button>
          </div>
          {date !== data.today && (
            <button className="btn h-11" onClick={() => go(data.today)}>
              Today
            </button>
          )}
          <Link className="btn h-11 hover:no-underline" to={`/week/${startOfWeek(date)}`}>
            <MenuIcon size={16} className="hidden sm:block" />
            <span className="sm:hidden">Week</span>
            <span className="hidden sm:inline">Week view</span>
          </Link>
        </div>
      </div>

      {/* On call hero */}
      <section className="flex flex-col gap-4 rounded-[18px] bg-navy p-5 text-white md:flex-row md:items-center md:gap-8 md:rounded-[20px] md:px-8 md:py-7">
        <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f2b233]/15 text-amber-call md:flex">
          <BellIcon />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-call md:text-xs">
            <span className="h-2 w-2 rounded-full bg-amber-call" />
            {callLabel}
            <span className="font-semibold normal-case tracking-normal text-[#c3cde3]">· {callWhen}</span>
          </div>
          {onCall ? (
            <>
              <div className="truncate font-display text-2xl font-semibold md:text-[30px]">{onCall.name}</div>
              <div className="text-sm text-[#c3cde3]">
                {onCall.phone ? (
                  <a href={whatsappHref(onCall.phone)} target="_blank" rel="noopener noreferrer" className="text-[#c3cde3] underline decoration-white/30 hover:text-white">
                    {onCall.phone}
                  </a>
                ) : (
                  'No number on file'
                )}
              </div>
            </>
          ) : shift.current ? (
            <div className="font-display text-2xl font-medium text-[#c3cde3] md:text-[30px]">{shift.current}</div>
          ) : (
            <div className="font-display text-2xl font-medium text-[#c3cde3] md:text-[30px]">No one assigned</div>
          )}
        </div>
        {onCall?.phone && (
          <a
            href={whatsappHref(onCall.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-call px-5 text-[15px] font-bold text-[#1c1405] hover:bg-[#f5c04f] hover:text-[#1c1405] hover:no-underline"
          >
            <WhatsAppIcon />
            WhatsApp
          </a>
        )}
      </section>

      {/* Admin-only status cards */}
      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <StatusCard title="Post-call (off)">
            {day.postCall ? (
              <>
                <div className="font-semibold">
                  <ResidentName id={day.postCall} phone />
                </div>
                {day.residents.find((r) => r.residentId === day.postCall)?.coveredBy && (
                  <p className="mt-1 text-sm text-muted">
                    Replaced by <ResidentName id={day.residents.find((r) => r.residentId === day.postCall)!.coveredBy} />
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Nobody</p>
            )}
          </StatusCard>
          <StatusCard title={`On vacation (${vacation.length})`}>
            {vacation.length === 0 && <p className="text-sm text-muted">Nobody</p>}
            <ul className="space-y-1 text-sm">
              {vacation.map((r) => (
                <li key={r.residentId}>
                  <ResidentName id={r.residentId} /> <span className="text-xs text-muted">({r.monthly})</span>
                  {r.coveredBy && (
                    <span className="text-xs text-muted">
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

      {/* Rotations */}
      {day.workingDay ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[22px] font-semibold md:text-2xl">Rotations</h2>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-muted md:text-sm">
                {rotations.length} services<span className="hidden sm:inline"> · {staffed} residents</span>
              </span>
              {isAdmin && (
                <button className="btn btn-sm no-print" onClick={() => setAdjusting(true)}>
                  Adjust assignments
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {rotations.map(([rot, ids]) => {
              const c = rotationColors(rot, rotByName.get(rot)?.kind);
              return (
                <div key={rot} className="card flex flex-col gap-3 p-4 md:min-h-[150px] md:gap-3.5 md:p-5">
                  <div className="flex items-center gap-2.5">
                    <RotationDot name={rot} />
                    <span className="flex-1 text-xs font-bold uppercase tracking-[0.08em] text-label md:text-[13px]">{rot}</span>
                  </div>
                  {ids.length === 0 && (
                    <div className="flex flex-1 items-center text-sm text-muted md:justify-center md:rounded-xl md:border md:border-dashed md:border-[#d3d8e2] md:py-4">
                      Unstaffed today
                    </div>
                  )}
                  {ids.map((id) => {
                    const r = day.residents.find((x) => x.residentId === id)!;
                    const res = resById.get(id);
                    return (
                      <div key={id} className="flex items-center gap-3">
                        <span className="avatar h-9 w-9 text-[13px] md:h-10 md:w-10 md:text-sm" style={{ background: c.tint, color: c.ink }}>
                          {initials(res?.name ?? id)}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold md:text-base">
                            <ResidentName id={id} />
                            {r.onCall && <span className="pill px-2 py-0 text-[10px]">on call</span>}
                            {isAdmin && r.manual && <span className="pill bg-[#eef0f4] px-2 py-0 text-[10px] text-muted">manual</span>}
                          </span>
                          {isAdmin && r.coveringFor && (
                            <span className="text-xs text-muted">
                              covering <ResidentName id={r.coveringFor} short /> ({r.monthly === 'Post-Call' ? 'post-call' : 'vacation'})
                            </span>
                          )}
                        </div>
                        {res?.phone && (
                          <a href={whatsappHref(res.phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${res.name}`} title={`WhatsApp ${res.phone}`} className="icon-btn bg-brand-50 text-brand-700 hover:bg-brand-100">
                            <WhatsAppIcon />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="card px-5 py-4 text-sm text-muted">
          {day.holiday ? 'Holiday' : 'Weekend'} – rotations are not staffed. Only the on-call resident is shown.
        </div>
      )}

      {isAdmin && (
        <>
          {(covering.length > 0 || external.length > 0 || day.residents.some((r) => r.status === 'unassigned' || (r.status === 'off' && r.manual))) && (
            <div className="grid gap-4 md:grid-cols-2">
              {covering.length > 0 && (
                <div className="card">
                  <div className="card-title">Who covers whom</div>
                  <ul className="divide-y divide-line text-sm">
                    {covering.map((r) => (
                      <li key={r.residentId} className="px-5 py-2.5">
                        <ResidentName id={r.residentId} /> <span className="text-muted">({r.monthly})</span> covers <ResidentName id={r.coveringFor} /> on{' '}
                        <RotationChip name={r.assignment} small />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {external.length > 0 && (
                <div className="card">
                  <div className="card-title">External rotations</div>
                  <ul className="divide-y divide-line text-sm">
                    {external.map((r) => (
                      <li key={r.residentId} className="flex justify-between gap-2 px-5 py-2.5">
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
                  <ul className="divide-y divide-line text-sm">
                    {day.residents
                      .filter((r) => r.status === 'unassigned' || (r.status === 'off' && r.manual))
                      .map((r) => (
                        <li key={r.residentId} className="px-5 py-2.5">
                          <ResidentName id={r.residentId} /> <span className="text-xs text-muted">{r.status}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-title">Warnings for this day</div>
            {day.coverCandidates.length > 1 && <CoverChooser day={day} />}
            <IssueList issues={day.issues} />
          </div>

          {date === data.today && nextIssues.length > 0 && (
            <div className="card">
              <div className="card-title">Coming up (next 14 days)</div>
              <IssueList issues={nextIssues.slice(0, 15)} showDate />
              {nextIssues.length > 15 && (
                <Link to="/warnings" className="block px-5 py-3 text-sm font-semibold">
                  See all {nextIssues.length} →
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {adjusting && <AdjustModal day={day} onClose={() => setAdjusting(false)} />}
      {!resById.size && <p className="text-muted">No residents yet – add some on the Residents page or import an Excel file.</p>}
    </div>
  );
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="label mb-2">{title}</div>
      {children}
    </div>
  );
}

function CoverChooser({ day }: { day: DaySchedule }) {
  const { data, mutate } = useStore();
  const current = data.coverChoices[day.date] ?? '';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#fdf6e3] px-5 py-3 text-sm">
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
  const set = (rid: string, v: string) => mutate(() => api(`/api/overrides/${day.date}/${rid}`, { method: 'PUT', json: { assignment: v } }));
  return (
    <Modal title={`Adjust ${formatDateLong(day.date)}`} onClose={onClose}>
      <p className="mb-3 text-xs text-muted">
        Manual overrides replace the computed assignment for this day only (e.g. to resolve a post-call or vacation conflict). Use “+ rotation”
        to have one resident cover several rotations.
      </p>
      <table className="table">
        <tbody>
          {day.residents.map((r) => (
            <tr key={r.residentId}>
              <td>
                <div className="font-medium">{resById.get(r.residentId)?.name}</div>
                <div className="text-xs text-muted">
                  {r.monthly ?? 'unassigned'} · {r.status}
                </div>
              </td>
              <td className="w-52">
                <ComboSelect
                  value={overrides[r.residentId] ?? ''}
                  onChange={(v) => void set(r.residentId, v)}
                  label={`${resById.get(r.residentId)?.name} on ${day.date}`}
                  blank={`Auto (${r.manual ? 'computed' : r.assignment ?? r.status})`}
                  monthlyOnly={false}
                  noSpecial
                  extraOptions={[{ value: OFF, label: 'Off' }]}
                  compact={false}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
