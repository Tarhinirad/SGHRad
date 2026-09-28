import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PGY_YEARS, type Resident } from '@shared';
import { api } from '../api';
import { Modal, PageHeader, PhoneLink, RotationChip } from '../components/ui';
import { useStore } from '../store';

export function ResidentsPage() {
  const { data, isAdmin, engine, mutate } = useStore();
  const [editing, setEditing] = useState<{ r: Resident; isNew: boolean } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState('');
  const today = engine.day(data.today);
  const list = data.residents.filter(
    (r) => (r.active || showInactive) && (!q || `${r.name} ${r.id} ${r.phone}`.toLowerCase().includes(q.toLowerCase())),
  );

  const nextId = () => {
    const nums = data.residents.map((r) => Number(/(\d+)$/.exec(r.id)?.[1] ?? 0));
    return `R${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`;
  };

  return (
    <div>
      <PageHeader title="Residents">
        <input className="input w-40" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing({ r: { id: nextId(), name: '', phone: '', year: 'PGY-1', active: true }, isNew: true })}>
            + Add resident
          </button>
        )}
      </PageHeader>

      {PGY_YEARS.map((year) => {
        const rs = list.filter((r) => r.year === year);
        if (!rs.length) return null;
        return (
          <div key={year} className="card mb-4">
            <div className="card-title">
              {year} <span className="font-normal text-slate-400">({rs.length})</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {rs.map((r) => {
                const d = today.residents.find((x) => x.residentId === r.id);
                return (
                  <li key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${r.active ? '' : 'opacity-50'}`}>
                    <div className="min-w-[10rem] flex-1">
                      <Link to={`/residents/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">{r.id}</span>
                      {!r.active && <span className="ml-2 rounded bg-slate-200 px-1 text-[10px]">inactive</span>}
                    </div>
                    <PhoneLink phone={r.phone} className="text-sm" />
                    <div className="w-40 text-xs">
                      {d?.status === 'vacation' ? (
                        <RotationChip name="Vacation" small />
                      ) : d?.status === 'post-call' ? (
                        <span className="text-slate-500">Post-call off</span>
                      ) : (
                        <RotationChip name={d?.assignment ?? d?.monthly ?? null} small />
                      )}
                      {d?.onCall && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] font-semibold text-brand-800">on call</span>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button className="btn btn-sm" onClick={() => setEditing({ r, isNew: false })}>
                          Edit
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => void mutate(() => api(`/api/residents/${r.id}`, { method: 'PUT', json: { active: !r.active } }))}
                        >
                          {r.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {editing && <ResidentForm initial={editing.r} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ResidentForm({ initial, isNew, onClose }: { initial: Resident; isNew: boolean; onClose: () => void }) {
  const { mutate } = useStore();
  const [r, setR] = useState(initial);
  const save = async () => {
    const ok = await mutate(() => (isNew ? api('/api/residents', { json: r }) : api(`/api/residents/${initial.id}`, { method: 'PUT', json: r })));
    if (ok) onClose();
  };
  return (
    <Modal title={isNew ? 'Add resident' : `Edit ${initial.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">ResidentID</label>
            <input className="input" value={r.id} disabled={!isNew} onChange={(e) => setR({ ...r, id: e.target.value.trim() })} />
          </div>
          <div className="col-span-2">
            <label className="label">Name</label>
            <input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} autoFocus />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Phone</label>
            <input className="input" type="tel" value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} placeholder="+961 …" />
          </div>
          <div>
            <label className="label">Year</label>
            <select className="input" value={r.year} onChange={(e) => setR({ ...r, year: e.target.value as Resident['year'] })}>
              {PGY_YEARS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /> Active
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!r.id || !r.name.trim()} onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
