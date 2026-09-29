import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_IR_CODES, IR_GUIDANCE, normalizeIrCodes, type IrCodes, type IrGuidance, type IrProcedure } from '@shared';
import { api } from '../api';
import { Modal, PageHeader, PrintButton } from '../components/ui';
import { useStore } from '../store';

const GUIDANCE_LABEL: Record<IrGuidance, string> = {
  none: 'No guidance code',
  ct: 'CT guidance',
  us: 'US guidance',
  either: 'CT or US guidance',
};

function Code({ children, tone = 'main' }: { children: string; tone?: 'main' | 'ct' | 'us' }) {
  const cls = tone === 'ct' ? 'bg-[#e6f0fb] text-[#0d4f8b]' : tone === 'us' ? 'bg-[#e4f6ee] text-[#0b6b45]' : 'bg-[#eef0f6] text-navy-ink';
  return <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[15px] font-semibold tracking-wide ${cls}`}>{children}</span>;
}

export function IrCodesPage() {
  const { isAdmin, mutate } = useStore();
  const [ir, setIr] = useState<IrCodes | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ proc: IrProcedure; isNew: boolean } | null>(null);
  const [editingGuidance, setEditingGuidance] = useState(false);

  useEffect(() => {
    api<IrCodes>('/api/ir-codes')
      .then(setIr)
      .catch((e) => setError((e as Error).message));
  }, []);

  const groups = useMemo(() => {
    if (!ir) return [];
    const needle = q.trim().toLowerCase();
    const match = (p: IrProcedure) => !needle || `${p.name} ${p.category} ${p.codes.join(' ')} ${p.notes}`.toLowerCase().includes(needle);
    const out = new Map<string, IrProcedure[]>();
    for (const p of ir.procedures) if (match(p)) out.set(p.category, [...(out.get(p.category) ?? []), p]);
    return [...out.entries()];
  }, [ir, q]);

  if (error) return <p className="text-red-700">Could not load IR codes: {error}</p>;
  if (!ir) return <p className="text-muted">Loading…</p>;

  /** Save the whole list; the server validates it. */
  const save = async (next: IrCodes) => {
    const ok = await mutate(async () => setIr(await api<IrCodes>('/api/ir-codes', { method: 'PUT', json: next })));
    return ok;
  };

  const saveProc = async (proc: IrProcedure, isNew: boolean) => {
    const list = isNew ? [...ir.procedures, proc] : ir.procedures.map((p) => (p.id === proc.id ? proc : p));
    return save({ ...ir, procedures: list });
  };

  const remove = (proc: IrProcedure) => {
    if (confirm(`Delete “${proc.name}”?`)) void save({ ...ir, procedures: ir.procedures.filter((p) => p.id !== proc.id) });
  };

  /** Swap with the neighbouring procedure of the same category. */
  const move = (proc: IrProcedure, dir: -1 | 1) => {
    const list = [...ir.procedures];
    const i = list.findIndex((p) => p.id === proc.id);
    let j = i + dir;
    while (j >= 0 && j < list.length && list[j].category !== proc.category) j += dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void save({ ...ir, procedures: list });
  };

  return (
    <div>
      <PageHeader title="IR codes">
        <input className="input w-44" placeholder="Search name or code…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && (
          <>
            <button className="btn" onClick={() => setEditingGuidance(true)}>
              Guidance codes
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setEditing({ proc: { id: '', name: '', category: groups[0]?.[0] ?? 'Biopsies', codes: [], codesMode: 'all', guidance: 'none', notes: '' }, isNew: true })}
            >
              + Add procedure
            </button>
          </>
        )}
        <PrintButton />
      </PageHeader>

      <div className="card mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6">
        <p className="m-0 flex-1 text-[15px] leading-relaxed">
          <b>Every biopsy, drainage and tube insertion is billed as the procedure code plus a guidance code</b> for the imaging that was used.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <Code tone="ct">{ir.ct.code}</Code> {ir.ct.label}
          </span>
          <span className="flex items-center gap-2">
            <Code tone="us">{ir.us.code}</Code> {ir.us.label}
          </span>
        </div>
      </div>

      {groups.length === 0 && <p className="text-muted">Nothing matches “{q}”.</p>}
      <div className="flex flex-col gap-5">
        {groups.map(([category, procs]) => (
          <section key={category} className="card print-full overflow-hidden">
            <div className="card-title">{category}</div>
            <ul className="divide-y divide-line">
              {procs.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
                  <div className="min-w-[13rem] flex-1">
                    <div className="text-[15px] font-semibold md:text-base">{p.name}</div>
                    {p.notes && <div className="text-[13px] text-muted">{p.notes}</div>}
                  </div>
                  <div className="flex min-w-[9rem] flex-wrap items-center gap-1.5">
                    {p.codes.map((c, i) => (
                      <span key={c + i} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-sm text-muted">{p.codesMode === 'any' ? 'or' : '+'}</span>}
                        <Code>{c}</Code>
                      </span>
                    ))}
                  </div>
                  <div className="flex min-w-[12rem] flex-wrap items-center gap-1.5 text-sm">
                    {p.guidance === 'none' ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <>
                        <span className="font-semibold text-muted">+</span>
                        {(p.guidance === 'ct' || p.guidance === 'either') && <Code tone="ct">{ir.ct.code}</Code>}
                        {p.guidance === 'either' && <span className="text-muted">or</span>}
                        {(p.guidance === 'us' || p.guidance === 'either') && <Code tone="us">{ir.us.code}</Code>}
                        <span className="text-[13px] text-muted">
                          {p.guidance === 'ct' ? 'under CT' : p.guidance === 'us' ? 'under US' : 'CT or US'}
                        </span>
                      </>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="no-print flex gap-1">
                      <button className="btn btn-sm" aria-label="Move up" onClick={() => move(p, -1)}>
                        ↑
                      </button>
                      <button className="btn btn-sm" aria-label="Move down" onClick={() => move(p, 1)}>
                        ↓
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditing({ proc: p, isNew: false })}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {isAdmin && (
        <div className="no-print mt-6">
          <button
            className="btn btn-sm"
            onClick={() => confirm('Replace the whole list with the original codes? Your edits will be lost.') && void save(DEFAULT_IR_CODES)}
          >
            Restore original list
          </button>
        </div>
      )}

      {editing && (
        <ProcedureForm
          initial={editing.proc}
          isNew={editing.isNew}
          categories={[...new Set(ir.procedures.map((p) => p.category))]}
          onSave={(p) => saveProc(p, editing.isNew)}
          onClose={() => setEditing(null)}
        />
      )}
      {editingGuidance && <GuidanceForm ir={ir} onSave={(next) => save(next)} onClose={() => setEditingGuidance(false)} />}
    </div>
  );
}

function ProcedureForm({
  initial,
  isNew,
  categories,
  onSave,
  onClose,
}: {
  initial: IrProcedure;
  isNew: boolean;
  categories: string[];
  onSave: (p: IrProcedure) => Promise<boolean>;
  onClose: () => void;
}) {
  const [p, setP] = useState(initial);
  const [codes, setCodes] = useState(initial.codes.join(', '));
  const [err, setErr] = useState('');

  const submit = async () => {
    const draft = { ...p, codes: codes.split(/[\s,;+]+/).filter(Boolean) };
    try {
      // Same validation as the server, for a friendlier message before saving.
      normalizeIrCodes({ ...DEFAULT_IR_CODES, procedures: [draft] });
    } catch (e) {
      return setErr((e as Error).message);
    }
    if (await onSave(draft)) onClose();
  };

  return (
    <Modal title={isNew ? 'Add procedure' : `Edit ${initial.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoFocus />
        </div>
        <div>
          <label className="label">Category</label>
          <input className="input" list="ir-categories" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} />
          <datalist id="ir-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Main code(s)</label>
            <input className="input font-mono" value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="3918, 3921" />
          </div>
          <div>
            <label className="label">Several codes</label>
            <select className="input" value={p.codesMode} onChange={(e) => setP({ ...p, codesMode: e.target.value as IrProcedure['codesMode'] })}>
              <option value="all">All billed</option>
              <option value="any">One of them</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Guidance code</label>
          <select className="input" value={p.guidance} onChange={(e) => setP({ ...p, guidance: e.target.value as IrGuidance })}>
            {IR_GUIDANCE.map((g) => (
              <option key={g} value={g}>
                {GUIDANCE_LABEL[g]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} />
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GuidanceForm({ ir, onSave, onClose }: { ir: IrCodes; onSave: (next: IrCodes) => Promise<boolean>; onClose: () => void }) {
  const [ct, setCt] = useState(ir.ct);
  const [us, setUs] = useState(ir.us);
  const [err, setErr] = useState('');
  const submit = async () => {
    try {
      normalizeIrCodes({ ...ir, ct, us });
    } catch (e) {
      return setErr((e as Error).message);
    }
    if (await onSave({ ...ir, ct, us })) onClose();
  };
  return (
    <Modal title="Guidance codes" onClose={onClose}>
      <div className="space-y-3">
        {(
          [
            ['CT', ct, setCt],
            ['US', us, setUs],
          ] as const
        ).map(([name, v, set]) => (
          <div key={name} className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{name} code</label>
              <input className="input font-mono" value={v.code} onChange={(e) => set({ ...v, code: e.target.value.trim() })} />
            </div>
            <div className="col-span-2">
              <label className="label">{name} label</label>
              <input className="input" value={v.label} onChange={(e) => set({ ...v, label: e.target.value })} />
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">Changing a code here updates every procedure that uses CT or US guidance.</p>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
