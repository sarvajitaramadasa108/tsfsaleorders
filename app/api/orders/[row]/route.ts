import { NextResponse } from 'next/server';
import { updateOrder, type SaleOrder } from '@/lib/orders';

export async function PATCH(request: Request, { params }: { params: { row: string } }) {
  try {
    const body = await request.json() as { sheet: string; order: SaleOrder };
    const order = { ...body.order, row: Number(params.row) };
    await updateOrder(body.sheet, order);
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}
