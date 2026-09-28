import { useEffect, useState } from 'react';
import { api } from '../api';
import { PageHeader } from '../components/ui';

interface Entry {
  id: number;
  ts: string;
  user: string;
  action: string;
  entity: string;
  details: any;
}

const PAGE = 50;

function summary(e: Entry): string {
  const d = e.details;
  if (!d) return '';
  switch (e.entity) {
    case 'monthly':
      return `${d.residentId} ${d.month}: ${d.before || '—'} → ${d.after || '—'}`;
    case 'call':
      return `${d.date}: ${d.before || '—'} → ${d.after || '—'}`;
    case 'vacation':
      return d.after ? `#${d.id} ${d.after.residentId} ${d.after.start} → ${d.after.end}` : `${d.residentId ?? ''} ${d.start ?? ''} → ${d.end ?? ''}`;
    case 'override':
      return `${d.date} ${d.residentId}: ${d.assignment || 'cleared'}`;
    case 'cover-choice':
      return `${d.date}: cover ${d.covered || 'default'}`;
    case 'resident':
      return d.after ? `${d.id}: ${diff(d.before, d.after)}` : `${d.id} ${d.name}`;
    case 'rotation':
      return d.after ? `${d.before.name}: ${diff(d.before, d.after)}` : d.name;
    case 'settings':
      return diff(d.before, d.after);
    case 'workbook':
      return `${d.mode}: residents +${d.residents.added}/~${d.residents.updated}, ${d.monthlyCells.changed} monthly cells, +${d.vacations.added} vacations, ${d.calls.changed} calls`;
    default:
      return JSON.stringify(d);
  }
}

function diff(a: Record<string, unknown>, b: Record<string, unknown>): string {
  return Object.keys(b)
    .filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: ${JSON.stringify(a?.[k])} → ${JSON.stringify(b[k])}`)
    .join('; ');
}

export function AuditPage() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; entries: Entry[] } | null>(null);
  useEffect(() => {
    api(`/api/audit?limit=${PAGE}&offset=${page * PAGE}`).then(setData, (e) => alert(e.message));
  }, [page]);

  return (
    <div>
      <PageHeader title="Audit log">
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
          ‹ Newer
        </button>
        <span className="text-sm text-slate-500">
          {data ? `${page * PAGE + 1}–${Math.min(data.total, (page + 1) * PAGE)} of ${data.total}` : ''}
        </span>
        <button className="btn" disabled={!data || (page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>
          Older ›
        </button>
      </PageHeader>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>What</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-xs">{new Date(e.ts).toLocaleString('en-GB')}</td>
                <td className="whitespace-nowrap">{e.user}</td>
                <td className="whitespace-nowrap">
                  {e.action} <span className="text-slate-500">{e.entity}</span>
                </td>
                <td className="text-xs text-slate-700">{summary(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
