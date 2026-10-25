import { useEffect, useState } from 'react';
import { addDays, formatDateShort, parseISO, type DaySchedule, type ISODate } from '@shared';
import { useStore } from '../store';
import { rotationColors } from './ui';

// The week table drawn as a portrait image, 1080 px wide (a phone screenshot's width), so it reads well when sent in a chat.
const W = 1080;
const PAD = 24;
const LABEL_W = 176;
const COL_W = (W - 2 * PAD - LABEL_W) / 7;
const CELL_X = 8;
const CELL_Y = 14;
const SANS = "'Plus Jakarta Sans', system-ui, sans-serif";
const DISPLAY = "'Fraunces', Georgia, serif";
const INK = '#0e1a33';
const NAVY = '#13254b';
const MUTED = '#5b6478';
const LINE = '#e3e6ec';
const CALL = '#f2b233';
const SHADE = '#eef0f4';

const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

function rangeLabel(start: ISODate) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const end = parseISO(addDays(start, 6));
  return `${parseISO(start).toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`;
}

async function render(
  start: ISODate,
  days: DaySchedule[],
  name: (id: string) => string,
  kind: (rot: string) => string | undefined,
): Promise<Blob | null> {
  await Promise.all([document.fonts.load(font(600, 40, DISPLAY)), document.fonts.load(font(700, 24)), document.fonts.load(font(600, 24))]).catch(() => {});
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Table rows: on call, then one per rotation; each cell lists names one per line, as on the Week page.
  const rotations = Object.keys(days[0].rotations);
  const cells: string[][][] = [
    days.map((d) => (d.onCall ? [name(d.onCall)] : [])),
    ...rotations.map((rot) => days.map((d) => (d.workingDay ? (d.rotations[rot] ?? []).map(name) : []))),
  ];

  // Largest name size (26 → 18 px) at which every name fits its column.
  let size = 26;
  for (; size > 18; size--) {
    ctx.font = font(600, size);
    if (cells.every((row) => row.every((c) => c.every((n) => ctx.measureText(n).width <= COL_W - 2 * CELL_X)))) break;
  }
  const lineH = Math.round(size * 1.3);
  const rowH = cells.map((row) => 2 * CELL_Y + Math.max(1, ...row.map((c) => c.length)) * lineH);

  const HEADER = 196;
  const HEAD_ROW = 84;
  const FOOTER = 64;
  const tableH = HEAD_ROW + rowH.reduce((a, b) => a + b, 0);
  const H = HEADER + PAD + tableH + FOOTER;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = '#f3f4f7';
  ctx.fillRect(0, 0, W, H);

  // Title band.
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, HEADER);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CALL;
  ctx.font = font(700, 24);
  ctx.fillText('SGUMC RADIOLOGY · WEEKLY SCHEDULE', PAD + 12, 62);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(600, 56, DISPLAY);
  ctx.fillText(`Week of ${formatDateShort(start)}`, PAD + 12, 132);
  ctx.fillStyle = '#c7d0e4';
  ctx.font = font(500, 28);
  ctx.fillText(rangeLabel(start), PAD + 12, 174);

  // Table card.
  const tx = PAD;
  const ty = HEADER + PAD;
  const tw = W - 2 * PAD;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, tableH, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();

  const colX = (i: number) => tx + LABEL_W + i * COL_W;
  // Weekends and holidays are shaded.
  days.forEach((d, i) => {
    if (d.workingDay) return;
    ctx.fillStyle = SHADE;
    ctx.fillRect(colX(i), ty, COL_W, tableH);
  });
  // Header row.
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(tx, ty, tw, HEAD_ROW);
  ctx.fillStyle = MUTED;
  ctx.font = font(700, 18);
  ctx.fillText('ROTATION', tx + 16, ty + 50);
  days.forEach((d, i) => {
    const dt = parseISO(d.date);
    const cx = colX(i) + COL_W / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = d.workingDay ? INK : MUTED;
    ctx.font = font(700, 20);
    ctx.fillText(dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase(), cx, ty + 34);
    ctx.font = font(600, 22);
    ctx.fillText(d.holiday ? 'Holiday' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }), cx, ty + 64, COL_W - 8);
    ctx.textAlign = 'left';
  });

  // Body rows.
  let y = ty + HEAD_ROW;
  cells.forEach((row, r) => {
    const h = rowH[r];
    const isCall = r === 0;
    if (isCall) {
      ctx.fillStyle = 'rgba(242, 178, 51, 0.16)';
      ctx.fillRect(tx, y, tw, h);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx + tw, y);
    ctx.stroke();

    const label = isCall ? 'ON CALL' : rotations[r - 1].toUpperCase();
    const base = y + CELL_Y + size;
    ctx.fillStyle = isCall ? CALL : rotationColors(rotations[r - 1], kind(rotations[r - 1])).dot;
    ctx.beginPath();
    ctx.arc(tx + 22, base - 7, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isCall ? NAVY : '#36405a';
    ctx.font = font(700, 18);
    ctx.fillText(label, tx + 36, base - 1, LABEL_W - 44);

    ctx.font = font(isCall ? 700 : 600, size);
    row.forEach((names, i) => {
      const cx = colX(i) + CELL_X;
      if (names.length === 0) {
        if (isCall || days[i].workingDay) {
          ctx.fillStyle = MUTED;
          ctx.fillText('—', cx, base);
        }
        return;
      }
      ctx.fillStyle = INK;
      names.forEach((n, k) => ctx.fillText(n, cx, base + k * lineH, COL_W - 2 * CELL_X));
    });
    y += h;
  });

  // Column dividers.
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(colX(i), ty);
    ctx.lineTo(colX(i), ty + tableH);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, tableH, 20);
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = font(500, 22);
  ctx.textAlign = 'center';
  ctx.fillText('Weekends and holidays are shaded.', W / 2, H - 26);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Phone-friendly PNG of the week's schedule, with share and download. */
export function WeekImage({ start, days }: { start: ISODate; days: DaySchedule[] }) {
  const { resById, rotByName, displayName } = useStore();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    const name = (id: string) => {
      const r = resById.get(id);
      return r ? displayName(r) : id;
    };
    void render(start, days, name, (rot) => rotByName.get(rot)?.kind).then((b) => {
      if (cancelled || !b) return;
      made = URL.createObjectURL(b);
      setBlob(b);
      setUrl(made);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [start, days, resById, rotByName, displayName]);

  const fileName = `schedule-week-${start}.png`;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  return (
    <section className="no-print mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-semibold">Weekly image</h2>
          <p className="m-0 text-xs text-muted">Sized for phones — share it in a chat or save it to your photos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canShare && (
            <button className="btn btn-primary" onClick={() => void navigator.share({ files: [file!], title: `Week of ${formatDateShort(start)}` }).catch(() => {})}>
              Share image
            </button>
          )}
          {url && (
            <a className="btn" href={url} download={fileName}>
              Download PNG
            </a>
          )}
        </div>
      </div>
      {url ? (
        <img src={url} alt={`Schedule for the week of ${formatDateShort(start)}`} className="mx-auto block w-full max-w-sm rounded-2xl border border-line shadow-sm" />
      ) : (
        <p className="text-sm text-muted">Rendering image…</p>
      )}
    </section>
  );
}
