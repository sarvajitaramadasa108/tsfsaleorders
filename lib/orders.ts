import { google } from 'googleapis';

export type SaleOrder = {
  row: number; date: string; so: string; customer: string; mobile: string; pax: string;
  total: string; credit: string; creditDate: string; utr: string; balance: string; status: string;
};
export type PaymentInput = { amount: string; date: string; reference: string };

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '1phTICQcIe6AxGWqCE9cVp-CGfjkFckayS8abds2XD34';
const HEADER = ['Date', 'SO', 'Customer', 'Mobile', 'Pax', 'Total Amount', 'Credit', 'Credit Date', 'UTR', 'Balance', 'Status'];
const EXCLUDED_CUSTOMERS = new Set([
  'gvmc night shelters', 'master homoeo vaidyalayam', 'industrial chemical corporation',
  'hkmcf-industrial estate', 'hkmcf- ap atchutapuram', 'umarama lingeswara swamy temple',
  'lotus wireless technologies india pvt. ltd.', 'hkmcf-ap kakinada', 'hkmcf ap -bobbili',
  'hkmcf- ap srikakulam', 'ssvpm temple mvp colony', 'sri hanuman charitable trust',
]);

function normalize(value: string) { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }
function monthName(date = new Date()) { return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'Asia/Kolkata' }).format(date); }

// Sheets sometimes returns its internal date serial (e.g. 46337) instead of the
// displayed date. Convert either representation to a consistent DD/MM/YYYY value.
function parseSheetDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) return new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86_400_000);
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSheetDate(value: unknown) {
  const date = parseSheetDate(value);
  return date ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date) : String(value ?? '');
}

function dateSortValue(value: string) { return parseSheetDate(value)?.getTime() || 0; }

function erpSessionCookie(headers: Headers) {
  const cookieHeaders = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [headers.get('set-cookie') || ''];
  const match = cookieHeaders.join('\n').match(/\bsid=([^;,\s]+)/i);
  if (!match) throw new Error(`ERP login did not return a session cookie (${cookieHeaders.filter(Boolean).length} Set-Cookie header${cookieHeaders.filter(Boolean).length === 1 ? '' : 's'} received).`);
  return `sid=${match[1]}`;
}

async function erpAuthHeaders(base: string, user: string, password: string) {
  const apiKey = process.env.ERP_API_KEY; const apiSecret = process.env.ERP_API_SECRET;
  if (apiKey && apiSecret) return { Authorization: `token ${apiKey}:${apiSecret}`, Accept: 'application/json' };
  const login = await fetch(`${base}/api/method/login`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ usr: user, pwd: password }), cache: 'no-store' });
  if (!login.ok) throw new Error('ERP login failed.');
  return { Cookie: erpSessionCookie(login.headers), Accept: 'application/json' };
}

function sheets() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google Sheets credentials are not configured.');
  const auth = new google.auth.JWT(email, undefined, key, ['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}

export async function monthSheetName(requested?: string) {
  const api = sheets();
  const meta = await api.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties.title' });
  const titles = meta.data.sheets?.map((sheet) => sheet.properties?.title || '') || [];
  if (requested && titles.includes(requested)) return requested;
  const current = monthName();
  return titles.find((title) => title.toLowerCase() === current.toLowerCase()) || current;
}

export async function readOrders(requestedSheet?: string) {
  const sheet = await monthSheetName(requestedSheet);
  const response = await sheets().spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${sheet}'!A1:K1000` });
  const values = response.data.values || [HEADER];
  const orders: SaleOrder[] = values.slice(1).map((value, index) => ({
    row: index + 2, date: formatSheetDate(value[0]), so: value[1] || '', customer: value[2] || '', mobile: value[3] || '',
    pax: value[4] || '', total: value[5] || '', credit: value[6] || '', creditDate: formatSheetDate(value[7]),
    utr: value[8] || '', balance: value[9] || '', status: value[10] || '',
  })).filter((order) => order.so).sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date) || b.row - a.row);
  return { sheet, orders };
}

export async function updateOrder(sheet: string, order: SaleOrder) {
  const values = [[order.date, order.so, order.customer, order.mobile, order.pax, order.total, order.credit, order.creditDate, order.utr, order.balance, order.status]];
  await sheets().spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `'${sheet}'!A${order.row}:K${order.row}`, valueInputOption: 'USER_ENTERED', requestBody: { values } });
}

async function ensurePaymentLog() {
  const api = sheets();
  const meta = await api.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties.title' });
  const exists = meta.data.sheets?.some((item) => item.properties?.title === 'Payment Log');
  if (!exists) {
    await api.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: 'Payment Log' } } }] } });
    await api.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: "'Payment Log'!A1:H1", valueInputOption: 'USER_ENTERED', requestBody: { values: [['Recorded at', 'Order month', 'Sales order', 'Customer', 'Amount received', 'Payment date', 'UTR / reference', 'Payment mode']] } });
  }
}

// Reconcile payments typed directly into a monthly order tab. Credit is treated as
// the cumulative amount received; only the not-yet-logged difference is appended.
async function reconcileManualPayments(sheet: string, orders: SaleOrder[]) {
  await ensurePaymentLog();
  const api = sheets();
  const log = await api.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Payment Log'!A2:H10000" });
  const loggedByOrder = new Map<string, number>();
  for (const row of log.data.values || []) {
    if (String(row[1] || '') !== sheet) continue;
    const key = String(row[2] || '');
    loggedByOrder.set(key, (loggedByOrder.get(key) || 0) + (Number(row[4]) || 0));
  }
  const paymentRows: (string | number)[][] = [];
  const summaryUpdates: { range: string; values: (string | number)[][] }[] = [];
  for (const order of orders) {
    const total = Number(order.total) || 0;
    const credit = Math.max(0, Number(order.credit) || 0);
    const logged = loggedByOrder.get(order.so) || 0;
    const remaining = Math.max(0, Math.round((total - credit) * 100) / 100);
    const status = credit <= 0 ? 'Unpaid' : remaining === 0 ? 'Paid' : 'Partially Paid';
    if (String(order.balance) !== String(remaining) || order.status !== status) summaryUpdates.push({ range: `'${sheet}'!J${order.row}:K${order.row}`, values: [[remaining, status]] });
    if (credit > logged) {
      const difference = Math.round((credit - logged) * 100) / 100;
      const reference = order.utr.trim();
      paymentRows.push([new Date().toISOString(), sheet, order.so, order.customer, difference, order.creditDate || formatSheetDate(new Date().toISOString()), reference, reference ? 'Bank / UTR' : 'Cash']);
    }
  }
  if (summaryUpdates.length) await api.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: summaryUpdates } });
  if (paymentRows.length) await api.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: "'Payment Log'!A:H", valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: paymentRows } });
  return paymentRows.length;
}

export async function recordPayment(sheet: string, order: SaleOrder, payment: PaymentInput) {
  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a payment amount greater than zero.');
  const total = Number(order.total) || 0;
  const previousCredit = Number(order.credit) || 0;
  const newCredit = Math.round((previousCredit + amount) * 100) / 100;
  const balance = Math.max(0, Math.round((total - newCredit) * 100) / 100);
  const status = balance === 0 ? 'Paid' : 'Partially Paid';
  const paymentDate = formatSheetDate(payment.date || new Date().toISOString().slice(0, 10));
  const reference = payment.reference.trim() || 'Cash';
  const updated = { ...order, credit: String(newCredit), creditDate: paymentDate, utr: reference, balance: String(balance), status };
  await updateOrder(sheet, updated);
  await ensurePaymentLog();
  await sheets().spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID, range: "'Payment Log'!A:H", valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[new Date().toISOString(), sheet, order.so, order.customer, amount, paymentDate, payment.reference.trim(), payment.reference.trim() ? 'Bank / UTR' : 'Cash']] },
  });
  return updated;
}

export async function syncCurrentMonth() {
  const { sheet, orders: currentOrders } = await readOrders();
  const paymentsLogged = await reconcileManualPayments(sheet, currentOrders);
  const user = process.env.ERP_USER || ''; const password = process.env.ERP_PASSWORD || '';
  const base = process.env.ERP_URL || 'https://hkmvizagerp.frappe.cloud';
  if ((!process.env.ERP_API_KEY || !process.env.ERP_API_SECRET) && (!user || !password)) throw new Error('ERP credentials are not configured.');
  const authHeaders = await erpAuthHeaders(base, user, password);
  const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const fields = ['name', 'transaction_date', 'customer', 'customer_name', 'contact_mobile', 'no_of_pax', 'grand_total', 'company', 'kitchen_order_type', 'set_warehouse'];
  const filters = [['docstatus', '=', 1], ['company', '=', 'Touchstone Foundation Visakhapatnam'], ['kitchen_order_type', '=', 'External Order'], ['set_warehouse', 'in', ['Kitchen Floor Industrial Estate - TSF', 'Kitchen floor Gambheeram - HKMCF']], ['transaction_date', '>=', start], ['transaction_date', '<=', end]];
  const url = new URL(`${base}/api/resource/Sales%20Order`);
  url.searchParams.set('fields', JSON.stringify(fields)); url.searchParams.set('filters', JSON.stringify(filters));
  url.searchParams.set('order_by', 'transaction_date asc'); url.searchParams.set('limit_page_length', '500');
  const response = await fetch(url, { headers: authHeaders });
  if (!response.ok) throw new Error('ERP order lookup failed.');
  const payload = await response.json() as { data: Array<Record<string, unknown>> };
  const existing = new Set(currentOrders.map((order) => order.so));
  const incoming = payload.data.filter((order) => !existing.has(String(order.name)) && !EXCLUDED_CUSTOMERS.has(normalize(String(order.customer_name || order.customer || ''))));
  if (!incoming.length) return { sheet, added: 0, paymentsLogged };
  const rows = incoming.map((order) => [String(order.transaction_date || ''), String(order.name || ''), String(order.customer_name || order.customer || ''), String(order.contact_mobile || ''), Number(order.no_of_pax || 0), Math.round(Number(order.grand_total || 0) * 100) / 100, '', '', '', Math.round(Number(order.grand_total || 0) * 100) / 100, 'Unpaid']);
  await sheets().spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${sheet}'!A:K`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: rows } });
  return { sheet, added: rows.length, paymentsLogged };
}
