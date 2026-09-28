import { useEffect, useState } from 'react';

export interface Clock {
  date: string; // YYYY-MM-DD in the hospital time zone
  hour: number;
  minute: number;
}

export function clockIn(timeZone: string, now = new Date()): Clock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** Current date/time in the hospital's time zone, refreshed every 30 seconds. */
export function useClock(timeZone = 'Asia/Beirut'): Clock {
  const [clock, setClock] = useState(() => clockIn(timeZone));
  useEffect(() => {
    const id = setInterval(() => setClock(clockIn(timeZone)), 30_000);
    return () => clearInterval(id);
  }, [timeZone]);
  return clock;
}

export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
