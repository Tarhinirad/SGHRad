/**
 * Interventional radiology billing codes. Every biopsy, drainage and tube insertion is billed as the
 * procedure's main code(s) plus an imaging-guidance code (CT or US). The list is editable by the admin.
 */

/** none = no guidance code; ct / us = that guidance only; either = CT or US, depending on what was used. */
export type IrGuidance = 'none' | 'ct' | 'us' | 'either';
export const IR_GUIDANCE: IrGuidance[] = ['none', 'ct', 'us', 'either'];

export interface IrGuidanceCode {
  code: string;
  label: string;
}

export interface IrProcedure {
  id: string;
  name: string;
  category: string;
  /** Main code(s). With codesMode "all" every code is billed; with "any" one of them is (e.g. nephrostomy). */
  codes: string[];
  codesMode: 'all' | 'any';
  guidance: IrGuidance;
  notes: string;
}

export interface IrCodes {
  ct: IrGuidanceCode;
  us: IrGuidanceCode;
  procedures: IrProcedure[];
}

const p = (id: string, category: string, name: string, codes: string[], guidance: IrGuidance, extra: Partial<IrProcedure> = {}): IrProcedure => ({
  id,
  name,
  category,
  codes,
  codesMode: 'all',
  guidance,
  notes: '',
  ...extra,
});

export const DEFAULT_IR_CODES: IrCodes = {
  ct: { code: '4216', label: 'CT guidance' },
  us: { code: '5502', label: 'US guidance' },
  procedures: [
    p('arterio', 'Angiography', 'Arterio', ['3918', '3921'], 'none'),
    p('arterio-chemo', 'Angiography', 'Arterio + chemo', ['3918', '3921', '3925'], 'none'),
    p('arterio-stent', 'Angiography', 'Arterio + stenting', ['3918', '3922', '3923'], 'none'),

    p('lung-bx', 'Biopsies', 'Lung biopsy', ['3960'], 'ct'),
    p('pleural-bx', 'Biopsies', 'Pleural biopsy', ['3818'], 'ct'),
    p('liver-bx', 'Biopsies', 'Liver biopsy', ['3929'], 'either'),
    p('thyroid-bx', 'Biopsies', 'Thyroid (parotid) biopsy', ['3875'], 'us'),
    p('kidney-bx', 'Biopsies', 'Kidney biopsy', ['3969'], 'either'),
    p('bone-bx', 'Biopsies', 'Bone biopsy', ['3949'], 'ct'),

    p('pleurodesis', 'Centesis & pleurodesis', 'Chemical pleurodesis', ['3817'], 'ct'),
    p('pleurocentesis', 'Centesis & pleurodesis', 'Pleurocentesis', ['3962'], 'either'),
    p('pericardiocentesis', 'Centesis & pleurodesis', 'Pericardiocentesis', ['3962'], 'either'),
    p('peritoneocentesis', 'Centesis & pleurodesis', 'Peritoneocentesis', ['3928'], 'either'),

    p('abscess-peritoneal', 'Abscess drainage', 'Abscess drainage – peritoneal', ['3936'], 'either'),
    p('abscess-retroperitoneal', 'Abscess drainage', 'Abscess drainage – retroperitoneal', ['3938'], 'either'),
    p('abscess-percutaneous', 'Abscess drainage', 'Abscess drainage – percutaneous', ['3937'], 'either'),

    p('ptc', 'Biliary & urinary', 'PTC', ['3934'], 'us'),
    p('nephrostomy', 'Biliary & urinary', 'Nephrostomy', ['3971', '3972', '3974'], 'either', { codesMode: 'any' }),
    p('nephrostomy-change', 'Biliary & urinary', 'Change nephrostomy', ['3975'], 'either'),
    p('jj', 'Biliary & urinary', 'JJ insertion', ['3974'], 'none'),

    p('gastrostomy', 'Gastrostomy', 'Gastrostomy', ['3836'], 'none'),
    p('gastrostomy-change', 'Gastrostomy', 'Change gastrostomy', ['3837'], 'none'),
  ],
};

/** The codes to bill for a procedure, as text: "3960 + 4216" / "3971 or 3972 or 3974 + 4216 or 5502". */
export function irSummary(proc: IrProcedure, ir: Pick<IrCodes, 'ct' | 'us'>): string {
  const main = proc.codes.join(proc.codesMode === 'any' ? ' or ' : ', ');
  const g = proc.guidance === 'ct' ? ir.ct.code : proc.guidance === 'us' ? ir.us.code : proc.guidance === 'either' ? `${ir.ct.code} or ${ir.us.code}` : '';
  return g ? `${main} + ${g}` : main;
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9.\-/]{0,11}$/;

/** Validate and clean an edited list. Throws an Error with a readable message. */
export function normalizeIrCodes(input: unknown): IrCodes {
  const fail = (m: string): never => {
    throw new Error(m);
  };
  const o = input as Partial<IrCodes> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.procedures)) return fail('Invalid IR codes');
  const guidance = (g: unknown, which: string): IrGuidanceCode => {
    const code = String((g as IrGuidanceCode | undefined)?.code ?? '').trim();
    const label = String((g as IrGuidanceCode | undefined)?.label ?? '').trim().slice(0, 40);
    if (!CODE_RE.test(code)) return fail(`${which} guidance code is missing or invalid`);
    return { code, label: label || which };
  };
  if (o.procedures.length > 300) fail('Too many procedures');
  const seen = new Set<string>();
  const procedures = o.procedures.map((raw, i): IrProcedure => {
    const r = raw as Partial<IrProcedure>;
    const name = String(r.name ?? '').trim().slice(0, 80);
    if (!name) return fail(`Procedure ${i + 1} needs a name`);
    const codes = (Array.isArray(r.codes) ? r.codes : []).map((c) => String(c).trim()).filter(Boolean);
    if (codes.length === 0) return fail(`${name}: add at least one code`);
    const badCode = codes.find((c) => !CODE_RE.test(c));
    if (badCode) return fail(`${name}: "${badCode}" is not a valid code`);
    const g = r.guidance as IrGuidance;
    if (!IR_GUIDANCE.includes(g)) return fail(`${name}: invalid guidance`);
    let id = typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, 40) : '';
    if (!id || seen.has(id)) id = `p${Date.now().toString(36)}${i}`;
    seen.add(id);
    return {
      id,
      name,
      category: String(r.category ?? '').trim().slice(0, 60) || 'Other',
      codes,
      codesMode: r.codesMode === 'any' ? 'any' : 'all',
      guidance: g,
      notes: String(r.notes ?? '').trim().slice(0, 200),
    };
  });
  return { ct: guidance(o.ct, 'CT'), us: guidance(o.us, 'US'), procedures };
}
