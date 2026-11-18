import { NextResponse } from 'next/server';
import { recordPayment, updateOrder, type PaymentInput, type SaleOrder } from '@/lib/orders';
import { requireAdmin } from '@/lib/auth';

export async function PATCH(request: Request, { params }: { params: { row: string } }) {
  try {
    requireAdmin();
    const body = await request.json() as { sheet: string; order: SaleOrder; payment?: PaymentInput };
    const order = { ...body.order, row: Number(params.row) };
    const updated = body.payment?.amount ? await recordPayment(body.sheet, order, body.payment) : (await updateOrder(body.sheet, order), order);
    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}
