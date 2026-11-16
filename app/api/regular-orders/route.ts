import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REGULAR_CUSTOMERS = new Set([
  'gvmc night shelters', 'master homoeo vaidyalayam', 'industrial chemical corporation',
  'hkmcf-industrial estate', 'hkmcf- ap atchutapuram', 'umarama lingeswara swamy temple',
  'lotus wireless technologies india pvt. ltd.', 'hkmcf-ap kakinada', 'hkmcf ap -bobbili',
  'hkmcf- ap srikakulam', 'ssvpm temple mvp colony', 'sri hanuman charitable trust',
]);
const normalize = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export async function GET(request: Request) {
  try {
    const user = process.env.ERP_USER; const password = process.env.ERP_PASSWORD;
    const base = process.env.ERP_URL || 'https://hkmvizagerp.frappe.cloud';
    if (!user || !password) throw new Error('ERP credentials are not configured.');
    const login = await fetch(`${base}/api/method/login`, { method: 'POST', body: new URLSearchParams({ usr: user, pwd: password }) });
    if (!login.ok) throw new Error('ERP login failed.');
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('ERP login did not return a session cookie.');
    const requestedMonth = new URL(request.url).searchParams.get('month');
    const today = new Date();
    const [year, month] = requestedMonth?.match(/^\d{4}-\d{2}$/) ? requestedMonth.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1];
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    const fields = ['name', 'transaction_date', 'customer', 'customer_name', 'no_of_pax', 'grand_total', 'status'];
    const filters = [['docstatus', '=', 1], ['transaction_date', '>=', start], ['transaction_date', '<=', end]];
    const url = new URL(`${base}/api/resource/Sales%20Order`);
    url.searchParams.set('fields', JSON.stringify(fields)); url.searchParams.set('filters', JSON.stringify(filters));
    url.searchParams.set('order_by', 'transaction_date asc'); url.searchParams.set('limit_page_length', '500');
    const response = await fetch(url, { headers: { Cookie: cookie, Accept: 'application/json' } });
    if (!response.ok) throw new Error('ERP order lookup failed.');
    const data = await response.json() as { data: Array<Record<string, unknown>> };
    const orders = data.data.filter((order) => REGULAR_CUSTOMERS.has(normalize(order.customer_name || order.customer))).map((order) => ({
      so: String(order.name || ''), date: String(order.transaction_date || ''), customer: String(order.customer_name || order.customer || ''),
      pax: Number(order.no_of_pax || 0), total: Number(order.grand_total || 0), status: String(order.status || ''),
    }));
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    return NextResponse.json({ month: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }), total, orders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load regular orders.' }, { status: 500 });
  }
}
