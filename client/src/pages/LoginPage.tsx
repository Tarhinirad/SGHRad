import { useState, type FormEvent } from 'react';
import { api } from '../api';

export function LoginPage({ onLogin }: { onLogin: (token: string, role: 'admin' | 'viewer', name: string) => void }) {
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
    <div className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-900 text-lg font-bold text-white">Rx</div>
          <h1 className="text-lg font-bold">SGUMC Radiology</h1>
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
        <button className="btn btn-primary w-full py-2" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">Residents use the read-only password; the admin password allows editing.</p>
      </form>
    </div>
  );
}
