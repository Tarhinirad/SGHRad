import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Icon } from '../components/ui';

export function LoginPage({ onLogin, onCancel }: { onLogin: (token: string, role: 'admin' | 'viewer', name: string) => void; onCancel?: () => void }) {
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string; role: 'admin' | 'viewer'; name: string }>('/api/login', { json: { password, name } });
      onLogin(r.token, r.role, r.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_60%)] p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-900 text-white">
            <Icon name="logo" className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">SGUMC Radiology</h1>
          <p className="text-sm text-slate-500">Resident schedule</p>
        </div>
        <label className="label" htmlFor="pw">
          Password
        </label>
        <input id="pw" type="password" className="input mb-3" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        <label className="label" htmlFor="nm">
          Your name <span className="font-normal normal-case text-slate-400">(for the edit log – admins)</span>
        </label>
        <input id="nm" className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Chief Resident" />
        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary min-h-11 w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {onCancel ? (
          <button type="button" className="btn mt-3 w-full" onClick={onCancel}>
            ← Back to the schedule
          </button>
        ) : (
          <p className="mt-4 text-center text-xs text-slate-400">Residents use the read-only password; the admin password allows editing.</p>
        )}
      </form>
    </div>
  );
}
