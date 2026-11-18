import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
export async function GET() { const session = currentUser(); return session ? NextResponse.json(session) : NextResponse.json({ error: 'Not signed in.' }, { status: 401 }); }
