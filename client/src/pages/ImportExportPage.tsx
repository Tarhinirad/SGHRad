import { useState } from 'react';
import { monthLabel } from '@shared';
import { ApiError, api, download } from '../api';
import { PageHeader, SeverityBadge, YearSelect } from '../components/ui';
import { useStore } from '../store';

interface Message {
  severity: 'error' | 'warning';
  sheet: string;
  row?: number;
  message: string;
}

interface Preview {
  mode: 'replace' | 'merge';
  ok: boolean;
  messages: Message[];
  unknownRotations: string[];
  summary: {
    residents: { added: number; updated: number; unchanged: number; removed: number };
    monthlyCells: { changed: number; total: number };
    vacations: { added: number; skippedDuplicates: number; removed: number };
    calls: { changed: number; total: number };
    newRotations: string[];
  };
  data: { residents: { id: string; name: string; year: string; phone: string; active: boolean }[]; months: string[] };
}

export function ImportExportPage() {
  const { isAdmin, currentYearStart, reload } = useStore();
  const [yearStart, setYearStart] = useState(currentYearStart);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [addUnknown, setAddUnknown] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const year = yearStart.slice(0, 4);

  const run = async (kind: 'preview' | 'commit', m = mode, add = addUnknown) => {
    if (!file) return;
    setBusy(true);
    setDone('');
    try {
      const qs = `?mode=${m}&addUnknown=${add ? 1 : 0}`;
      const body = await file.arrayBuffer();
      if (kind === 'preview') setPreview(await api<Preview>(`/api/import/preview${qs}`, { body }));
      else {
        await api(`/api/import/commit${qs}`, { body });
        setPreview(null);
        setFile(null);
        setDone('Import complete. The schedule has been updated.');
        await reload();
      }
    } catch (e) {
      const payload = (e as ApiError).payload;
      if (payload?.messages) setPreview((p) => (p ? { ...p, ok: false, messages: payload.messages } : p));
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const errors = preview?.messages.filter((m) => m.severity === 'error') ?? [];
  const warnings = preview?.messages.filter((m) => m.severity === 'warning') ?? [];

  return (
    <div>
      <PageHeader title="Import / Export" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Export to Excel</h2>
          <p className="mb-3 text-sm text-muted">
            Downloads the current data as <b>.xlsx</b> with the sheets Residents, Monthly Schedule, Vacations and Daily Calls (one row per day of the
            academic year).
          </p>
          <div className="flex flex-wrap gap-2">
            <YearSelect value={yearStart} onChange={setYearStart} />
            <button className="btn btn-primary" onClick={() => void download(`/api/export?year=${year}`, 'schedule.xlsx').catch((e) => alert(e.message))}>
              ⬇ Download
            </button>
          </div>
          <button className="btn mt-3" onClick={() => void download(`/api/export?year=${year}&blank=1`, 'template.xlsx').catch((e) => alert(e.message))}>
            ⬇ Blank template
          </button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Import from Excel</h2>
          {!isAdmin ? (
            <p className="text-sm text-muted">Sign in with the admin password to import.</p>
          ) : (
            <>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mb-3 block w-full text-sm"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                  setDone('');
                }}
              />
              <div className="mb-3 space-y-1 text-sm">
                <label className="flex items-start gap-2">
                  <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1" />
                  <span>
                    <b>Merge</b> – update residents by ID, overwrite non-empty monthly cells and call days, add new vacations. Nothing is deleted.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1" />
                  <span>
                    <b>Replace</b> – delete all residents, monthly assignments, vacations and calls, then load the file.
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={addUnknown} onChange={(e) => setAddUnknown(e.target.checked)} />
                  Add unknown rotation names as new external rotations
                </label>
              </div>
              <button className="btn btn-primary" disabled={!file || busy} onClick={() => void run('preview')}>
                {busy ? 'Working…' : 'Preview & validate'}
              </button>
              {done && <p className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">✓ {done}</p>}
            </>
          )}
        </div>
      </div>

      {preview && (
        <div className="card mt-4">
          <div className="card-title flex flex-wrap items-center gap-2">
            <span className="flex-1">
              Preview ({preview.mode}) – {errors.length} error(s), {warnings.length} warning(s)
            </span>
            <button className="btn btn-primary" disabled={!preview.ok || busy} onClick={() => void run('commit', preview.mode)}>
              {preview.ok ? `Import (${preview.mode})` : 'Fix errors to import'}
            </button>
          </div>
          <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Residents" lines={[`${preview.summary.residents.added} new`, `${preview.summary.residents.updated} updated`, `${preview.summary.residents.unchanged} unchanged`, preview.mode === 'replace' ? `${preview.summary.residents.removed} removed` : '']} />
            <Stat
              title="Monthly schedule"
              lines={[`${preview.summary.monthlyCells.total} cells`, `${preview.summary.monthlyCells.changed} changed`, `${preview.data.months.length} months: ${preview.data.months.length ? `${monthLabel(preview.data.months[0])} – ${monthLabel(preview.data.months[preview.data.months.length - 1])}` : ''}`]}
            />
            <Stat title="Vacations" lines={[`${preview.summary.vacations.added} to add`, `${preview.summary.vacations.skippedDuplicates} duplicates skipped`, preview.mode === 'replace' ? `${preview.summary.vacations.removed} existing removed` : '']} />
            <Stat title="Daily calls" lines={[`${preview.summary.calls.total} days with a resident`, `${preview.summary.calls.changed} changed`]} />
          </div>
          {preview.unknownRotations.length > 0 && (
            <div className="mx-4 mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Unknown rotation values: <b>{preview.unknownRotations.join(', ')}</b>.{' '}
              {!addUnknown && (
                <button
                  className="underline"
                  onClick={() => {
                    setAddUnknown(true);
                    void run('preview', preview.mode, true);
                  }}
                >
                  Add them as external rotations
                </button>
              )}{' '}
              or add/rename them in Settings → Rotations, then preview again.
            </div>
          )}
          {preview.messages.length > 0 && (
            <div className="max-h-96 overflow-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>Sheet</th>
                    <th>Row</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {[...errors, ...warnings].map((m, i) => (
                    <tr key={i}>
                      <td>
                        <SeverityBadge severity={m.severity} />
                      </td>
                      <td className="whitespace-nowrap">{m.sheet}</td>
                      <td>{m.row ?? ''}</td>
                      <td>{m.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.data.residents.length > 0 && (
            <details className="border-t border-line px-4 py-2 text-sm">
              <summary className="cursor-pointer text-muted">Residents in file ({preview.data.residents.length})</summary>
              <ul className="mt-2 columns-1 text-xs sm:columns-2 lg:columns-3">
                {preview.data.residents.map((r) => (
                  <li key={r.id}>
                    {r.id} – {r.name} ({r.year}){!r.active && ' – inactive'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="card mt-4 p-4 text-sm text-muted">
        <h2 className="mb-2 font-semibold text-navy-ink">Workbook format</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Residents</b>: ResidentID | Name | Phone | Year (PGY-1 … PGY-4) | Active (Y/N)
          </li>
          <li>
            <b>Monthly Schedule</b>: ResidentID | Name | one column per month (header like “Jul 2026”)
          </li>
          <li>
            <b>Vacations</b>: ResidentID | Name | Start Date | End Date | Notes
          </li>
          <li>
            <b>Daily Calls</b>: Date | On-Call ResidentID | On-Call Name (one row per day)
          </li>
        </ul>
        <p className="mt-2">The ResidentID is what links sheets together; names are only checked and a mismatch gives a warning.</p>
      </div>
    </div>
  );
}

function Stat({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded border border-line p-3">
      <div className="label">{title}</div>
      {lines.filter(Boolean).map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}
