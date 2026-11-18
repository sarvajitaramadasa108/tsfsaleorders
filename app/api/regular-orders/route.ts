import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Compare a stable, punctuation-free version because ERP customer names can vary
// slightly (for example, “HKMCF- AP” versus “HKMCF-AP”).
const regularCustomerKey = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const REGULAR_CUSTOMERS = new Set([
  'gvmcnightshelters', 'masterhomoeovaidyalayam', 'masterhomeovaidyalayam',
  'industrialchemicalcorporation', 'hkmcfindustrialestate', 'hkmcfapatchutapuram',
  'umaramalingeswaraswamytemple', 'lotuswirelesstechnologiesindiapvtltd',
  'hkmcfapkakinada', 'hkmcfapbobbili', 'hkmcfapsrikakulam',
  'ssvpmtemplemvpcolony', 'srihanumancharitabletrust',
]);

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
    let response = await fetch(url, { headers: { Cookie: cookie, Accept: 'application/json' } });
    // ERP Cloud can occasionally return a short-lived gateway/server error. Retry once
    // before reporting it to the user.
    if (!response.ok && response.status >= 500) response = await fetch(url, { headers: { Cookie: cookie, Accept: 'application/json' } });
    if (!response.ok) {
      const detail = (await response.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 180);
      throw new Error(`ERP order lookup failed (${response.status})${detail ? `: ${detail}` : '.'}`);
    }
    const data = await response.json() as { data: Array<Record<string, unknown>> };
    const orders = data.data.filter((order) => REGULAR_CUSTOMERS.has(regularCustomerKey(order.customer_name || order.customer))).map((order) => ({
      so: String(order.name || ''), date: String(order.transaction_date || ''), customer: String(order.customer_name || order.customer || ''),
      pax: Number(order.no_of_pax || 0), total: Number(order.grand_total || 0), status: String(order.status || ''),
    }));
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    return NextResponse.json({ month: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }), total, orders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load regular orders.' }, { status: 500 });
  }
}
