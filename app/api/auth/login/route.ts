import { NextResponse } from 'next/server';
import { createSession, sessionCookieName } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json() as { username?: string; password?: string };
    if (!username || !password) return NextResponse.json({ error: 'Enter your ERP username and password.' }, { status: 400 });
    const base = process.env.ERP_URL || 'https://hkmvizagerp.frappe.cloud';
    const response = await fetch(`${base}/api/method/login`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ usr: username, pwd: password }), cache: 'no-store' });
    if (!response.ok) return NextResponse.json({ error: 'ERP username or password is incorrect.' }, { status: 401 });
    const result = await response.json() as { message?: string };
    if (result.message !== 'Logged In') return NextResponse.json({ error: 'ERP sign-in was not accepted.' }, { status: 401 });
    const out = NextResponse.json({ user: username });
    out.cookies.set(sessionCookieName, createSession(username), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12 });
    return out;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to sign in.' }, { status: 500 }); }
}
