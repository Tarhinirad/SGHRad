import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { LogoIcon } from '../components/icons';

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
    <div className="flex min-h-screen items-center justify-center bg-navy p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[20px] bg-white p-7 shadow-xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] bg-navy text-white">
            <LogoIcon size={26} />
          </div>
          <h1 className="m-0 text-2xl font-semibold">SGUMC Radiology</h1>
          <p className="text-sm text-muted">Resident schedule</p>
        </div>
        <label className="label" htmlFor="pw">
          Password
        </label>
        <input id="pw" type="password" className="input mb-3" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        <label className="label" htmlFor="nm">
          Your name <span className="font-normal normal-case text-muted">(for the edit log – admins)</span>
        </label>
        <input id="nm" className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Chief Resident" />
        {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary h-12 w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {onCancel ? (
          <button type="button" className="btn mt-3 w-full" onClick={onCancel}>
            ← Back to the schedule
          </button>
        ) : (
          <p className="mt-4 text-center text-xs text-muted">Residents: use the resident password for the read-only view. The admin password allows editing.</p>
        )}
      </form>
    </div>
  );
}
