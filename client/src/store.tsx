import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ScheduleEngine,
  academicYearMonths,
  academicYearStartFor,
  firstOfMonth,
  lastOfMonth,
  type MonthKey,
  type Resident,
  type Rotation,
  type ScheduleData,
} from '@shared';
import { api } from './api';

export interface AppData extends ScheduleData {
  today: string;
  timeZone?: string;
}

interface Store {
  data: AppData;
  engine: ScheduleEngine;
  reload: () => Promise<void>;
  isAdmin: boolean;
  userName: string;
  resById: Map<string, Resident>;
  rotByName: Map<string, Rotation>;
  /** Run an edit, then reload; shows errors via alert. */
  mutate: (fn: () => Promise<unknown>) => Promise<boolean>;
  currentYearStart: MonthKey;
  yearOf: (yearStart: MonthKey) => { months: MonthKey[]; from: string; to: string };
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

export function DataProvider({ role, name, children }: { role: 'admin' | 'viewer'; name: string; children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api<AppData>('/api/data'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<Store | null>(() => {
    if (!data) return null;
    const currentYearStart = academicYearStartFor(data.today, data.settings.academicYearStartMonth);
    return {
      data,
      engine: new ScheduleEngine(data),
      reload,
      isAdmin: role === 'admin',
      userName: name,
      resById: new Map(data.residents.map((r) => [r.id, r])),
      rotByName: new Map(data.rotations.map((r) => [r.name, r])),
      mutate: async (fn) => {
        try {
          await fn();
          await reload();
          return true;
        } catch (e) {
          alert((e as Error).message);
          await reload();
          return false;
        }
      },
      currentYearStart,
      yearOf: (ys) => {
        const months = academicYearMonths(ys);
        return { months, from: firstOfMonth(months[0]), to: lastOfMonth(months[11]) };
      },
    };
  }, [data, reload, role, name]);

  if (error && !data)
    return (
      <div className="p-8 text-center text-red-700">
        Could not load data: {error}{' '}
        <button className="btn ml-2" onClick={() => void reload()}>
          Retry
        </button>
      </div>
    );
  if (!value) return <div className="p-8 text-center text-muted">Loading schedule…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
