/**
 * Simple shared-password authentication.
 *  - ADMIN_PASSWORD  → role "admin": can edit everything. The admin types their name at login,
 *                      which is recorded in the audit log.
 *  - VIEWER_PASSWORD → role "viewer": read-only access (residents).
 * Sessions are stateless HMAC-signed tokens sent as "Authorization: Bearer <token>".
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { type DB, getSetting, putSetting } from './db';

export type Role = 'admin' | 'viewer';
export interface Session {
  role: Role;
  name: string;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function authConfig(db: DB) {
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    secret = getSetting(db, 'sessionSecret');
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      putSetting(db, 'sessionSecret', secret);
    }
  }
  return {
    secret,
    adminPassword: process.env.ADMIN_PASSWORD ?? 'admin',
    viewerPassword: process.env.VIEWER_PASSWORD ?? 'resident',
  };
}

function b64(s: string) {
  return Buffer.from(s).toString('base64url');
}

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function signToken(secret: string, s: Omit<Session, 'exp'>, now = Date.now()): string {
  const payload = b64(JSON.stringify({ ...s, exp: now + TTL_MS }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(secret: string, token: string, now = Date.now()): Session | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (typeof s.exp !== 'number' || s.exp < now) return null;
    if (s.role !== 'admin' && s.role !== 'viewer') return null;
    return s;
  } catch {
    return null;
  }
}

export function login(cfg: ReturnType<typeof authConfig>, password: string, name: string): Session | null {
  if (safeEqual(password, cfg.adminPassword)) return { role: 'admin', name: name.trim() || 'admin', exp: 0 };
  if (safeEqual(password, cfg.viewerPassword)) return { role: 'viewer', name: name.trim() || 'viewer', exp: 0 };
  return null;
}

/**
 * Viewing is public unless REQUIRE_LOGIN_TO_VIEW=true: requests without a valid token are treated
 * as a read-only guest. Editing always requires the admin password.
 */
export function publicViewEnabled() {
  return process.env.REQUIRE_LOGIN_TO_VIEW !== 'true';
}

export function requireAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : typeof req.query.token === 'string' ? req.query.token : '';
    const s = token ? verifyToken(secret, token) : null;
    if (s) req.session = s;
    else if (publicViewEnabled()) req.session = { role: 'viewer', name: 'guest', exp: 0 };
    else return res.status(401).json({ error: 'Not signed in' });
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}
