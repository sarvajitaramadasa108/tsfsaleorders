'use client';

import { useEffect, useMemo, useState } from 'react';

type Order = { row: number; date: string; so: string; customer: string; mobile: string; pax: string; total: string; credit: string; creditDate: string; utr: string; balance: string; status: string; };
type Data = { sheet: string; orders: Order[] };
const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));

export default function Home() {
  const [data, setData] = useState<Data | null>(null); const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All'); const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true); const [notice, setNotice] = useState('');
  const load = async () => { setLoading(true); const response = await fetch('/api/orders', { cache: 'no-store' }); const json = await response.json(); if (!response.ok) setNotice(json.error); else setData(json); setLoading(false); };
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => (data?.orders || []).filter((order) => {
    const text = `${order.so} ${order.customer} ${order.mobile}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (status === 'All' || order.status.toLowerCase() === status.toLowerCase());
  }), [data, search, status]);
  const unpaid = (data?.orders || []).filter((order) => /unpaid|not paid|partially/i.test(order.status)).length;
  const sync = async () => { setNotice('Syncing eligible orders…'); const response = await fetch('/api/orders', { method: 'POST' }); const json = await response.json(); setNotice(response.ok ? `${json.added} order(s) added to ${json.sheet}.` : json.error); if (response.ok) load(); };
  const save = async () => { if (!selected || !data) return; const response = await fetch(`/api/orders/${selected.row}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet: data.sheet, order: selected }) }); const json = await response.json(); if (!response.ok) setNotice(json.error); else { setNotice('Order updated in Google Sheets.'); setSelected(null); load(); } };
  return <main>
    <aside><div className="brand"><span>TSF</span><strong>Sales<br/>Orders</strong></div><nav><a className="active">Orders</a><a>Follow-ups</a><a>Settings</a></nav><div className="sidebar-note">Manual sync only<br/><small>Google Sheets is the data source</small></div></aside>
    <section className="workspace"><header><div><p className="eyebrow">Sales operations</p><h1>{data?.sheet || 'Current month'} orders</h1><p className="subtitle">Review, filter, and update orders without working in a spreadsheet.</p></div><button className="primary" onClick={sync}>↻ Sync eligible orders</button></header>
      <div className="metrics"><Metric label="Orders" value={String(data?.orders.length || 0)} /><Metric label="Need follow-up" value={String(unpaid)} accent /><Metric label="Order value" value={money((data?.orders || []).reduce((sum, order) => sum + Number(order.total || 0), 0).toString())} /></div>
      <div className="toolbar"><input placeholder="Search customer, sales order, or mobile" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="filters">{['All', 'Unpaid', 'Paid', 'Partially Paid'].map((item) => <button key={item} onClick={() => setStatus(item)} className={status === item ? 'selected' : ''}>{item}</button>)}</div></div>
      {notice && <p className="notice">{notice}</p>}
      <div className="table-wrap"><table><thead><tr><th>Sales order</th><th>Customer</th><th>Pax</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="empty">Loading orders…</td></tr> : visible.map((order) => <tr key={order.row}><td><strong>{order.so}</strong><small>{order.date}</small></td><td><strong>{order.customer}</strong><small>{order.mobile || 'No mobile number'}</small></td><td>{order.pax || '—'}</td><td>{money(order.total)}</td><td>{money(order.balance)}</td><td><span className={`pill ${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status || 'Open'}</span></td><td><button className="edit" onClick={() => setSelected(order)}>Edit</button></td></tr>)}</tbody></table></div>
    </section>
    {selected && <div className="modal-backdrop"><section className="modal"><div><p className="eyebrow">Editing {selected.so}</p><h2>Update order</h2></div><div className="form">{[['customer','Customer'],['mobile','Mobile'],['pax','Pax'],['total','Total amount'],['credit','Credit'],['creditDate','Credit date'],['utr','UTR'],['balance','Balance'],['status','Status']].map(([key, label]) => <label key={key}>{label}<input value={selected[key as keyof Order] as string} onChange={(event) => setSelected({ ...selected, [key]: event.target.value })} /></label>)}</div><div className="modal-actions"><button onClick={() => setSelected(null)}>Cancel</button><button className="primary" onClick={save}>Save changes</button></div></section></div>}
  </main>;
}
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <article className={accent ? 'metric accent' : 'metric'}><p>{label}</p><strong>{value}</strong></article>; }
