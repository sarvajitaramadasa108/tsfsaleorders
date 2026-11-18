import { NextResponse } from 'next/server';
import { sessionCookieName } from '@/lib/auth';
export async function POST() { const out = NextResponse.json({ ok: true }); out.cookies.set(sessionCookieName, '', { path: '/', maxAge: 0 }); return out; }
