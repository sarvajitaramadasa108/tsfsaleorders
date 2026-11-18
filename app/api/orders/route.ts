import { NextResponse } from 'next/server';
import { readOrders, syncCurrentMonth } from '@/lib/orders';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try { requireUser(); return NextResponse.json(await readOrders(new URL(request.url).searchParams.get('sheet') || undefined)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load orders.' }, { status: 500 }); }
}
export async function POST() {
  try { requireUser(); return NextResponse.json(await syncCurrentMonth()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Sync failed.' }, { status: 500 }); }
}
