import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { readPaymentLog } from '@/lib/orders';
export const dynamic = 'force-dynamic';
export async function GET() { try { requireUser(); return NextResponse.json(await readPaymentLog()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load payment log.' }, { status: 500 }); } }
