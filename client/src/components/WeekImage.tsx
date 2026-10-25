import { useEffect, useState } from 'react';
import { addDays, formatDateShort, parseISO, type DaySchedule, type ISODate } from '@shared';
import { useStore } from '../store';
import { rotationColors } from './ui';

// Portrait image sized for phone screens (1080 px wide, like a phone screenshot) so it reads well when sent in a chat.
const W = 1080;
const PAD = 40;
const CARD_PAD = 32;
const LABEL_W = 280;
const SANS = "'Plus Jakarta Sans', system-ui, sans-serif";
const DISPLAY = "'Fraunces', Georgia, serif";
const INK = '#0e1a33';
const NAVY = '#13254b';
const MUTED = '#5b6478';
const LINE = '#e3e6ec';
const CALL = '#f2b233';

interface Row {
  label: string;
  dot: string;
  lines: string[];
}

interface DayBlock {
  day: DaySchedule;
  callName: string | null;
  rows: Row[];
  height: number;
}

const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

/** Greedy line wrap that keeps each name whole. */
function wrap(ctx: CanvasRenderingContext2D, names: string[], width: number): string[] {
  if (names.length === 0) return ['—'];
  const lines: string[] = [];
  let cur = '';
  names.forEach((n, i) => {
    const word = i < names.length - 1 ? `${n},` : n;
    const next = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(next).width > width) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  });
  if (cur) lines.push(cur);
  return lines;
}

function longDate(d: ISODate) {
  return parseISO(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function rangeLabel(start: ISODate) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const end = parseISO(addDays(start, 6));
  return `${parseISO(start).toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`;
}

async function render(start: ISODate, days: DaySchedule[], name: (id: string) => string, kind: (rot: string) => string | undefined): Promise<Blob | null> {
  await Promise.all([document.fonts.load(font(600, 40, DISPLAY)), document.fonts.load(font(700, 30)), document.fonts.load(font(600, 30))]).catch(() => {});
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Layout pass: wrap names and measure each day card.
  const namesW = W - 2 * PAD - 2 * CARD_PAD - LABEL_W;
  ctx.font = font(600, 30);
  const blocks: DayBlock[] = days.map((day) => {
    const rows: Row[] = day.workingDay
      ? Object.entries(day.rotations).map(([rot, ids]) => ({
          label: rot,
          dot: rotationColors(rot, kind(rot)).dot,
          lines: wrap(ctx, ids.map(name), namesW),
        }))
      : [];
    const rowsH = rows.reduce((h, r) => h + 24 + r.lines.length * 40, 0);
    return { day, callName: day.onCall ? name(day.onCall) : null, rows, height: 96 + (rows.length ? rowsH + 12 : 0) };
  });
  const HEADER = 230;
  const GAP = 20;
  const FOOTER = 80;
  const H = HEADER + PAD + blocks.reduce((h, b) => h + b.height + GAP, 0) - GAP + FOOTER;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = '#f3f4f7';
  ctx.fillRect(0, 0, W, H);

  // Header band.
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, HEADER);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CALL;
  ctx.font = font(700, 26);
  ctx.fillText('SGUMC RADIOLOGY · WEEKLY SCHEDULE', PAD, 72);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(600, 62, DISPLAY);
  ctx.fillText(`Week of ${formatDateShort(start)}`, PAD, 150);
  ctx.fillStyle = '#c7d0e4';
  ctx.font = font(500, 30);
  ctx.fillText(rangeLabel(start), PAD, 198);

  let y = HEADER + PAD;
  for (const b of blocks) {
    const x = PAD;
    const w = W - 2 * PAD;
    ctx.fillStyle = b.day.workingDay ? '#ffffff' : '#f7f8fa';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, b.height, 24);
    ctx.fill();
    ctx.stroke();

    // Day title.
    ctx.fillStyle = b.day.workingDay ? INK : MUTED;
    ctx.font = font(600, 38, DISPLAY);
    const title = longDate(b.day.date);
    ctx.fillText(title, x + CARD_PAD, y + 62);
    if (b.day.holiday) {
      const tw = ctx.measureText(title).width;
      ctx.font = font(700, 22);
      ctx.fillStyle = MUTED;
      ctx.fillText('HOLIDAY', x + CARD_PAD + tw + 16, y + 60);
    }

    // On-call pill, right aligned.
    ctx.font = font(700, 28);
    const pill = b.callName ? `On call · ${b.callName}` : 'On call · —';
    const pw = ctx.measureText(pill).width + 64;
    const px = x + w - CARD_PAD - pw;
    ctx.fillStyle = '#fdf0cf';
    ctx.beginPath();
    ctx.roundRect(px, y + 26, pw, 50, 25);
    ctx.fill();
    ctx.fillStyle = CALL;
    ctx.beginPath();
    ctx.arc(px + 26, y + 51, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5300';
    ctx.fillText(pill, px + 44, y + 61);

    // Rotation rows.
    let ry = y + 96;
    for (const r of b.rows) {
      ctx.strokeStyle = '#eef0f4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + CARD_PAD, ry);
      ctx.lineTo(x + w - CARD_PAD, ry);
      ctx.stroke();
      const base = ry + 12 + 30;
      ctx.fillStyle = r.dot;
      ctx.beginPath();
      ctx.arc(x + CARD_PAD + 8, base - 9, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#36405a';
      ctx.font = font(700, 24);
      ctx.fillText(r.label.toUpperCase(), x + CARD_PAD + 28, base - 1, LABEL_W - 36);
      ctx.font = font(600, 30);
      ctx.fillStyle = r.lines[0] === '—' ? MUTED : INK;
      r.lines.forEach((l, i) => ctx.fillText(l, x + CARD_PAD + LABEL_W, base + i * 40));
      ry += 24 + r.lines.length * 40;
    }
    y += b.height + GAP;
  }

  ctx.fillStyle = MUTED;
  ctx.font = font(500, 22);
  ctx.textAlign = 'center';
  ctx.fillText('Weekends and holidays show the on-call resident only.', W / 2, H - 34);

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
