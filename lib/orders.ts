import { google } from 'googleapis';

export type SaleOrder = {
  row: number; date: string; so: string; customer: string; mobile: string; pax: string;
  total: string; credit: string; creditDate: string; utr: string; balance: string; status: string;
};

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

export async function syncCurrentMonth() {
  const { sheet, orders: currentOrders } = await readOrders();
  const user = process.env.ERP_USER; const password = process.env.ERP_PASSWORD;
  const base = process.env.ERP_URL || 'https://hkmvizagerp.frappe.cloud';
  if (!user || !password) throw new Error('ERP credentials are not configured.');
  const login = await fetch(`${base}/api/method/login`, { method: 'POST', body: new URLSearchParams({ usr: user, pwd: password }) });
  if (!login.ok) throw new Error('ERP login failed.');
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('ERP login did not return a session cookie.');
  const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const fields = ['name', 'transaction_date', 'customer', 'customer_name', 'contact_mobile', 'no_of_pax', 'grand_total', 'company', 'kitchen_order_type', 'set_warehouse'];
  const filters = [['docstatus', '=', 1], ['company', '=', 'Touchstone Foundation Visakhapatnam'], ['kitchen_order_type', '=', 'External Order'], ['set_warehouse', 'in', ['Kitchen Floor Industrial Estate - TSF', 'Kitchen floor Gambheeram - HKMCF']], ['transaction_date', '>=', start], ['transaction_date', '<=', end]];
  const url = new URL(`${base}/api/resource/Sales%20Order`);
  url.searchParams.set('fields', JSON.stringify(fields)); url.searchParams.set('filters', JSON.stringify(filters));
  url.searchParams.set('order_by', 'transaction_date asc'); url.searchParams.set('limit_page_length', '500');
  const response = await fetch(url, { headers: { Cookie: cookie, Accept: 'application/json' } });
  if (!response.ok) throw new Error('ERP order lookup failed.');
  const payload = await response.json() as { data: Array<Record<string, unknown>> };
  const existing = new Set(currentOrders.map((order) => order.so));
  const incoming = payload.data.filter((order) => !existing.has(String(order.name)) && !EXCLUDED_CUSTOMERS.has(normalize(String(order.customer_name || order.customer || ''))));
  if (!incoming.length) return { sheet, added: 0 };
  const rows = incoming.map((order) => [String(order.transaction_date || ''), String(order.name || ''), String(order.customer_name || order.customer || ''), String(order.contact_mobile || ''), Number(order.no_of_pax || 0), Math.round(Number(order.grand_total || 0) * 100) / 100, '', '', '', Math.round(Number(order.grand_total || 0) * 100) / 100, 'Unpaid']);
  await sheets().spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${sheet}'!A:K`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: rows } });
  return { sheet, added: rows.length };
}
