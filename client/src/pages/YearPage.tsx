import { useState } from 'react';
import { Link } from 'react-router-dom';
import { POST_CALL, VACATION_COVER, monthLabel, normalizeMonthly, splitParts, type MonthKey } from '@shared';
import { api } from '../api';
import { PageHeader, PrintButton, ComboSelect, RotationChip, YearSelect } from '../components/ui';
import { useStore } from '../store';

export function YearPage() {
  const { data, isAdmin, mutate, currentYearStart, yearOf, engine } = useStore();
  const [yearStart, setYearStart] = useState(currentYearStart);
  const [showInactive, setShowInactive] = useState(false);
  const { months } = yearOf(yearStart);
  const residents = data.residents.filter((r) => r.active || showInactive);
  const currentMonth = data.today.slice(0, 7);

  const set = (residentId: string, month: MonthKey, value: string) =>
    mutate(() => api('/api/monthly', { method: 'PUT', json: { residentId, month, value } }));

  const count = (m: MonthKey, role: string) =>
    data.residents.filter((r) => r.active && splitParts(data.monthly[r.id]?.[m]).includes(role)).length;

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
              <th className="sticky left-0 z-10 bg-[#f7f8fa]">Resident</th>
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
                  {isAdmin ? (
                    <Link to={`/residents/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  )}
                  <div className="text-[10px] text-muted">
                    {isAdmin && <>{r.id} · </>}{r.year}
                  </div>
                </td>
                {months.map((m) => {
                  const v = data.monthly[r.id]?.[m] ?? '';
                  return (
                    <td key={m} className="p-1 text-center">
                      {isAdmin ? (
                        <MonthCell value={v} label={`${r.name} ${monthLabel(m)}`} onChange={(nv) => void set(r.id, m, nv)} />
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
                    <td key={m} className={`text-center text-[11px] ${n === 0 ? 'bg-red-50 font-semibold text-red-700' : 'text-muted'}`}>
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
                  <td key={m} className={`text-center text-[11px] ${n ? 'text-amber-700' : 'text-muted'}`}>
                    {n || '✓'}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Each cell is the resident's assignment for the month. Use ½ to split a month (e.g. Body/IR = days 1–{data.settings.splitDay} Body, then IR);
        in Excel type it as “Body/IR”. Mammography is not assigned monthly – it is where the Vacation Cover resident goes when
        nobody is on vacation.
      </p>
    </div>
  );
}

/** Admin cell editor: one rotation for the month, or two (split month, first half / second half). */
function MonthCell({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  const { data } = useStore();
  const parts = splitParts(value);
  const [splitting, setSplitting] = useState(false);
  const [draft, setDraft] = useState<[string, string] | null>(null);
  const isSplit = parts.length > 1 || splitting;
  const select = (v: string, set: (x: string) => void, aria: string, blank = '—') => (
    <ComboSelect value={v} onChange={set} label={aria} blank={blank} />
  );

  if (!isSplit)
    return (
      <div className="flex items-start gap-0.5">
        {select(parts[0] ?? '', (x) => onChange(x), label)}
        <button
          type="button"
          className="no-print rounded px-1 text-[11px] text-muted hover:bg-[#eef0f4] hover:text-navy-ink"
          title="Split this month in two halves"
          onClick={() => setSplitting(true)}
        >
          ½
        </button>
      </div>
    );

  const a = draft?.[0] ?? (parts.length > 1 ? parts[0] : parts[0] ?? '');
  const b = draft?.[1] ?? (parts.length > 1 ? parts[1] : '');
  // Save only once both halves are chosen; until then keep the choice locally.
  const save = (x: string, y: string) => {
    if (x && y) {
      onChange(normalizeMonthly(`${x}/${y}`));
      setSplitting(false);
      setDraft(null);
    } else setDraft([x, y]);
  };
  return (
    <div className="space-y-0.5 rounded border border-dashed border-line p-0.5">
      <div className="flex items-center gap-0.5">
        <span className="w-6 text-[9px] text-muted">1–{data.settings.splitDay}</span>
        {select(a, (x) => save(x, b), `${label} first half`)}
      </div>
      <div className="flex items-center gap-0.5">
        <span className="w-6 text-[9px] text-muted">{data.settings.splitDay + 1}+</span>
        {select(b, (y) => save(a, y), `${label} second half`, 'choose…')}
      </div>
      <button
        type="button"
        className="no-print w-full text-[10px] text-muted hover:text-red-600"
        onClick={() => {
          setSplitting(false);
          setDraft(null);
          if (a !== value) onChange(a);
        }}
      >
        un-split
      </button>
    </div>
  );
}
