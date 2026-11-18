import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'tsf_session';
const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('Website login is not configured.');
  return value;
};
const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');

export type Role = 'admin' | 'incharge';
export function createSession(user: string, role: Role = 'admin') {
  const payload = Buffer.from(JSON.stringify({ user, role, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function sessionUser(token?: string): { user: string; role: Role } | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString()); return data.exp > Date.now() && typeof data.user === 'string' && (data.role === 'admin' || data.role === 'incharge') ? { user: data.user, role: data.role } : null; }
  catch { return null; }
}

export function currentUser() { return sessionUser(cookies().get(COOKIE)?.value); }
export function requireUser() { const user = currentUser(); if (!user) throw new Error('Please sign in to continue.'); return user; }
export function requireAdmin() { const session = requireUser(); if (session.role !== 'admin') throw new Error('Admin access is required.'); return session; }
export const sessionCookieName = COOKIE;
