const TOKEN_KEY = 'sgumc-schedule-token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable – session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: any,
  ) {
    super(message);
  }
}

interface Opts {
  method?: string;
  json?: unknown;
  body?: BodyInit;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.body) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(path, {
    method: opts.method ?? (opts.json !== undefined || opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  const payload = isJson ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') {
      setToken(null);
      window.dispatchEvent(new Event('auth-expired'));
    }
    throw new ApiError(res.status, payload?.error ?? res.statusText, payload);
  }
  return payload as T;
}

export async function download(path: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
