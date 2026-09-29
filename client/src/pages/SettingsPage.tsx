import { useState } from 'react';
import { formatDateShort, type Rotation, type Settings } from '@shared';
import { api } from '../api';
import { PageHeader, RotationChip } from '../components/ui';
import { useStore } from '../store';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KIND_HELP: Record<Rotation['kind'], string> = {
  internal: 'Department rotation – shown on daily/weekly views, capacity-checked',
  external: 'Off-site – excluded from the department display',
  special: 'Role (Vacation Cover / Post-Call)',
};

export function SettingsPage() {
  const { isAdmin } = useStore();
  return (
    <div>
      <PageHeader title="Settings" />
      {!isAdmin && <p className="mb-4 rounded bg-[#eef0f4] px-3 py-2 text-sm text-muted">Read-only – sign in as admin to change settings.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <RulesCard />
        <HolidaysCard />
      </div>
      <RotationsCard />
      {isAdmin && <DangerCard />}
    </div>
  );
}

function RulesCard() {
  const { data, isAdmin, mutate } = useStore();
  const s = data.settings;
  const save = (patch: Partial<Settings>) => mutate(() => api('/api/settings', { method: 'PUT', json: patch }));
  const internal = data.rotations.filter((r) => r.kind === 'internal');
  const toggle = (k: keyof Settings, label: string, help: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" disabled={!isAdmin} checked={s[k] as boolean} onChange={(e) => void save({ [k]: e.target.checked })} />
      <span>
        {label}
        <span className="block text-xs text-muted">{help}</span>
      </span>
    </label>
  );
  return (
    <div className="card">
      <div className="card-title">Scheduling rules</div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Academic year starts</label>
            <select className="input" disabled={!isAdmin} value={s.academicYearStartMonth} onChange={(e) => void save({ academicYearStartMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Max residents / rotation</label>
            <input
              type="number"
              min={1}
              max={20}
              className="input"
              disabled={!isAdmin}
              defaultValue={s.maxPerRotation}
              onBlur={(e) => Number(e.target.value) !== s.maxPerRotation && void save({ maxPerRotation: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <label className="label">On-call hours (hospital time)</label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {(
                [
                  ['callWeekdayStart', 'Working-day call starts'],
                  ['callOffDayStart', 'Weekend / holiday call starts'],
                  ['callEnd', 'Every call ends next morning'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  {label}
                  <input
                    type="time"
                    className="input w-28"
                    disabled={!isAdmin}
                    defaultValue={s[k]}
                    onBlur={(e) => e.target.value && e.target.value !== s[k] && void save({ [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <span className="text-xs text-muted">
              A call listed on a working day runs from {s.callWeekdayStart} until {s.callEnd} the next morning; a call listed on a weekend or holiday runs from{' '}
              {s.callOffDayStart} until {s.callEnd} the next morning. On a working day between {s.callEnd} and {s.callWeekdayStart} nobody is on call.
            </span>
          </div>
          <div className="col-span-2">
            <label className="label">Split months (e.g. “Body/IR”): first rotation until day</label>
            <input
              type="number"
              min={1}
              max={27}
              className="input w-24"
              disabled={!isAdmin}
              defaultValue={s.splitDay}
              onBlur={(e) => Number(e.target.value) !== s.splitDay && void save({ splitDay: Number(e.target.value) })}
            />
            <span className="text-xs text-muted">
              Days 1–{s.splitDay} = first rotation, day {s.splitDay + 1} to month end = second rotation.
            </span>
          </div>
          <div>
            <label className="label">Vacation Cover default</label>
            <select className="input" disabled={!isAdmin} value={s.vacationCoverDefault} onChange={(e) => void save({ vacationCoverDefault: e.target.value })}>
              {internal.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Post-Call when nobody to replace</label>
            <select className="input" disabled={!isAdmin} value={s.postCallIdleRotation} onChange={(e) => void save({ postCallIdleRotation: e.target.value })}>
              {internal.map((r) => (
                <option key={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Working days (rotations staffed)</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={s.workingDays.includes(i)}
                  onChange={(e) => void save({ workingDays: e.target.checked ? [...s.workingDays, i] : s.workingDays.filter((x) => x !== i) })}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        {toggle('postCallAfterNonWorkingDay', 'Post-call applies after weekend/holiday calls', 'e.g. the Sunday on-call resident is off on Monday.')}
        {toggle('externalEligibleForCalls', 'Residents on external rotations can take calls', 'If unchecked, calling them raises a warning.')}
        {toggle('allowConsecutiveCalls', 'Allow calls on consecutive days', 'If unchecked, the same resident on call two days in a row raises a warning.')}
      </div>
    </div>
  );
}

function HolidaysCard() {
  const { data, isAdmin, mutate } = useStore();
  const [d, setD] = useState('');
  const hol = data.settings.holidays;
  const save = (holidays: string[]) => mutate(() => api('/api/settings', { method: 'PUT', json: { holidays } }));
  return (
    <div className="card">
      <div className="card-title">Holidays (rotations not staffed)</div>
      <div className="p-4">
        {isAdmin && (
          <div className="mb-3 flex gap-2">
            <input type="date" className="input w-auto" value={d} onChange={(e) => setD(e.target.value)} />
            <button
              className="btn"
              disabled={!d || hol.includes(d)}
              onClick={() => {
                void save([...hol, d]);
                setD('');
              }}
            >
              Add
            </button>
          </div>
        )}
        <ul className="flex flex-wrap gap-2">
          {hol.length === 0 && <li className="text-sm text-muted">None</li>}
          {hol.map((h) => (
            <li key={h} className="flex items-center gap-1 rounded border border-line bg-[#f7f8fa] px-2 py-0.5 text-sm">
              {formatDateShort(h)} {h.slice(0, 4)}
              {isAdmin && (
                <button className="text-muted hover:text-red-600" onClick={() => void save(hol.filter((x) => x !== h))} aria-label="Remove">
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RotationsCard() {
  const { data, isAdmin, mutate } = useStore();
  const [draft, setDraft] = useState<Rotation>({ name: '', kind: 'external', monthly: true, warnIfEmpty: false, sortOrder: 0 });
  const update = (name: string, patch: Partial<Rotation>) =>
    mutate(() => api(`/api/rotations/${encodeURIComponent(name)}`, { method: 'PUT', json: patch }));
  const rename = (r: Rotation) => {
    const to = prompt(`Rename "${r.name}" to (updates every schedule cell using it):`, r.name);
    if (to && to.trim() && to.trim() !== r.name) void update(r.name, { name: to.trim() });
  };
  return (
    <div className="card mt-4">
      <div className="card-title">Rotations</div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th title="Can be chosen in the monthly schedule">Monthly</th>
              <th title="Warn when nobody is assigned on a working day">Warn if empty</th>
              <th>Order</th>
              {isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {data.rotations.map((r) => (
              <tr key={r.name}>
                <td>
                  <RotationChip name={r.name} />
                </td>
                <td>
                  {isAdmin && r.kind !== 'special' ? (
                    <select className="input w-auto" value={r.kind} onChange={(e) => void update(r.name, { kind: e.target.value as Rotation['kind'] })}>
                      <option value="internal">internal</option>
                      <option value="external">external</option>
                    </select>
                  ) : (
                    r.kind
                  )}
                  <div className="text-[11px] text-muted">{KIND_HELP[r.kind]}</div>
                </td>
                <td>
                  <input type="checkbox" disabled={!isAdmin || r.kind === 'special'} checked={r.monthly} onChange={(e) => void update(r.name, { monthly: e.target.checked })} />
                </td>
                <td>
                  <input
                    type="checkbox"
                    disabled={!isAdmin || r.kind !== 'internal'}
                    checked={r.warnIfEmpty}
                    onChange={(e) => void update(r.name, { warnIfEmpty: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="input w-16"
                    disabled={!isAdmin}
                    defaultValue={r.sortOrder}
                    onBlur={(e) => Number(e.target.value) !== r.sortOrder && void update(r.name, { sortOrder: Number(e.target.value) })}
                  />
                </td>
                {isAdmin && (
                  <td className="whitespace-nowrap text-right">
                    {r.kind !== 'special' && (
                      <>
                        <button className="btn btn-sm" onClick={() => rename(r)}>
                          Rename
                        </button>{' '}
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => confirm(`Delete "${r.name}"?`) && void mutate(() => api(`/api/rotations/${encodeURIComponent(r.name)}`, { method: 'DELETE' }))}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line p-4">
          <div>
            <label className="label">New rotation</label>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Cardiac" />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Rotation['kind'], warnIfEmpty: e.target.value === 'internal' })}>
              <option value="internal">internal</option>
              <option value="external">external</option>
            </select>
          </div>
          <button
            className="btn btn-primary"
            disabled={!draft.name.trim()}
            onClick={async () => {
              const ok = await mutate(() => api('/api/rotations', { json: { ...draft, name: draft.name.trim(), sortOrder: undefined } }));
              if (ok) setDraft({ ...draft, name: '' });
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function DangerCard() {
  const { mutate } = useStore();
  return (
    <div className="card mt-4 border-red-200">
      <div className="card-title text-red-700">Sample data</div>
      <div className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="flex-1">Replace everything with the 14-resident sample data (useful for demos). Export first if you want to keep the current data.</span>
        <button
          className="btn btn-danger"
          onClick={() => confirm('Delete ALL current data and load the sample data?') && void mutate(() => api('/api/admin/reseed', { json: {} }))}
        >
          Reset to sample data
        </button>
      </div>
    </div>
  );
}
