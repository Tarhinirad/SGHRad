import { useState } from 'react';
import { addMonths, daysInRange, diffDays, firstOfMonth, formatDateShort, lastOfMonth, monthLabel, weekday, type Vacation } from '@shared';
import { api } from '../api';
import { Modal, PageHeader, PrintButton, ResidentName } from '../components/ui';
import { useStore } from '../store';

export function VacationsPage() {
  const { data, isAdmin, mutate } = useStore();
  const [editing, setEditing] = useState<Vacation | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming');
  const [resident, setResident] = useState('');
  const [month, setMonth] = useState(data.today.slice(0, 7));

  const list = data.vacations
    .filter((v) => (filter === 'all' || v.end >= data.today) && (!resident || v.residentId === resident))
    .sort((a, b) => a.start.localeCompare(b.start));

  const overlaps = (v: Vacation) =>
    data.vacations.filter((o) => o.id !== v.id && o.start <= v.end && v.start <= o.end && data.residents.find((r) => r.id === o.residentId)?.active);

  const del = (v: Vacation) => {
    if (confirm('Delete this vacation?')) void mutate(() => api(`/api/vacations/${v.id}`, { method: 'DELETE' }));
  };

  return (
    <div>
      <PageHeader title="Vacations">
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing({ residentId: '', start: data.today, end: data.today, notes: '' })}>
            + Add vacation
          </button>
        )}
        <PrintButton />
      </PageHeader>

      <VacationCalendar month={month} setMonth={setMonth} />

      <div className="card mt-4">
        <div className="card-title flex flex-wrap items-center gap-2">
          <span className="flex-1">List</span>
          <select className="input no-print w-auto" value={filter} onChange={(e) => setFilter(e.target.value as 'upcoming' | 'all')}>
            <option value="upcoming">Current & upcoming</option>
            <option value="all">All</option>
          </select>
          <select className="input no-print w-auto" value={resident} onChange={(e) => setResident(e.target.value)}>
            <option value="">All residents</option>
            {data.residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>From</th>
                <th>To</th>
                <th className="text-right">Days</th>
                <th>Overlaps with</th>
                <th>Notes</th>
                {isAdmin && <th className="no-print" />}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No vacations.
                  </td>
                </tr>
              )}
              {list.map((v) => {
                const o = overlaps(v);
                return (
                  <tr key={v.id} className={v.start <= data.today && data.today <= v.end ? 'bg-green-50' : ''}>
                    <td>
                      <ResidentName id={v.residentId} />
                    </td>
                    <td className="whitespace-nowrap">{formatDateShort(v.start)}</td>
                    <td className="whitespace-nowrap">{formatDateShort(v.end)}</td>
                    <td className="text-right">{diffDays(v.start, v.end) + 1}</td>
                    <td className="text-xs">
                      {o.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className="text-amber-800">
                          ⚠{' '}
                          {o.map((x, i) => (
                            <span key={x.id}>
                              {i > 0 && ', '}
                              <ResidentName id={x.residentId} short />
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-muted">{v.notes}</td>
                    {isAdmin && (
                      <td className="no-print whitespace-nowrap text-right">
                        <button className="btn btn-sm" onClick={() => setEditing(v)}>
                          Edit
                        </button>{' '}
                        <button className="btn btn-sm btn-danger" onClick={() => del(v)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <VacationForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function VacationCalendar({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { data, engine } = useStore();
  const days = daysInRange(firstOfMonth(month), lastOfMonth(month));
  const residents = data.residents.filter((r) => r.active);
  const onVac = (d: string) => residents.filter((r) => engine.vacationOn(r.id, d)).length;
  return (
    <div className="card">
      <div className="card-title flex items-center gap-2">
        <span className="flex-1">Calendar – {monthLabel(month)}</span>
        <button className="btn btn-sm no-print" onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <button className="btn btn-sm no-print" onClick={() => setMonth(addMonths(month, 1))}>
          ›
        </button>
      </div>
      <div className="print-full overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 text-left text-xs font-semibold">Resident</th>
              {days.map((d) => (
                <th key={d} className={`w-6 min-w-6 font-normal ${weekday(d) === 0 || weekday(d) === 6 ? 'text-muted' : ''} ${d === data.today ? 'bg-brand-100' : ''}`}>
                  {Number(d.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-0.5 text-xs">{r.name}</td>
                {days.map((d) => {
                  const v = engine.vacationOn(r.id, d);
                  return (
                    <td
                      key={d}
                      title={v ? `${r.name}: ${v.start} → ${v.end}${v.notes ? ` (${v.notes})` : ''}` : undefined}
                      className={`h-5 border-l border-line ${v ? 'bg-green-500' : weekday(d) === 0 || weekday(d) === 6 ? 'bg-[#f7f8fa]' : ''}`}
                    />
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-line">
              <td className="sticky left-0 z-10 bg-white px-2 py-0.5 text-xs font-semibold">On vacation</td>
              {days.map((d) => {
                const n = onVac(d);
                return (
                  <td key={d} className={`text-center font-semibold ${n > 1 ? 'bg-amber-100 text-amber-800' : 'text-muted'}`}>
                    {n || ''}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-xs text-muted">Days with more than one resident away are highlighted – check the Warnings page for cover conflicts.</p>
    </div>
  );
}

function VacationForm({ initial, onClose }: { initial: Vacation; onClose: () => void }) {
  const { data, mutate } = useStore();
  const [v, setV] = useState(initial);
  const save = async () => {
    const ok = await mutate(() =>
      initial.id ? api(`/api/vacations/${initial.id}`, { method: 'PUT', json: v }) : api('/api/vacations', { json: v }),
    );
    if (ok) onClose();
  };
  const conflicts = v.residentId
    ? Object.entries(data.calls).filter(([d, id]) => id === v.residentId && d >= v.start && d <= v.end).map(([d]) => d)
    : [];
  return (
    <Modal title={initial.id ? 'Edit vacation' : 'Add vacation'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Resident</label>
          <select className="input" value={v.residentId} onChange={(e) => setV({ ...v, residentId: e.target.value })}>
            <option value="">Select…</option>
            {data.residents
              .filter((r) => r.active || r.id === v.residentId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.year})
                </option>
              ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start</label>
            <input type="date" className="input" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value, end: v.end < e.target.value ? e.target.value : v.end })} />
          </div>
          <div>
            <label className="label">End</label>
            <input type="date" className="input" value={v.end} min={v.start} onChange={(e) => setV({ ...v, end: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={v.notes ?? ''} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </div>
        {conflicts.length > 0 && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            ⚠ This resident is on call during the vacation: {conflicts.map(formatDateShort).join(', ')}. Reassign those calls in the Call calendar.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!v.residentId || !v.start || !v.end || v.end < v.start} onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
