import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ScanLine, Plus, Minus, Trash2, ShoppingCart, PackageCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { categories, money, validAmount, today, lineCents } from '../lib/store.js';
import { ProductThumbnail } from '../components/ProductPhotos.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import {useAuth} from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import Toast from '../components/Toast.jsx';
export default function CounterPage() {
  useLocale();
  const {profile} = useAuth();
  const canAddPart = profile?.role !== 'cashier';
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'stock_in' ? 'stock_in' : 'sale');
  const [q, setQ] = useState(''),
    [category, setCategory] = useState('all'),
    [rows, setRows] = useState([]),
    [page, setPage] = useState(1),
    [count, setCount] = useState(0),
    [loading, setLoading] = useState(false);
  const [cart, setCart] = useState([]),
    [scan, setScan] = useState(false),
    [unknown, setUnknown] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(null);
  const [credit, setCredit] = useState(false),
    [customer, setCustomer] = useState(''),
    [phone, setPhone] = useState(''),
    [paid, setPaid] = useState('0'),
    [due, setDue] = useState(''),
    [note, setNote] = useState(''),
    [reference, setReference] = useState(''),
    [supplier, setSupplier] = useState(''),
    [suppliers, setSuppliers] = useState([]);
  const guard = useRef(false),
    request = useRef(0),
    operation = useRef(null);
  useEffect(() => {
    api.get('/api/suppliers').then(r => setSuppliers(r.data || [])).catch(() => {});
  }, []);
  async function load() {
    const n = ++request.current;
    setLoading(true);
    try {
      const r = await api.get(`/api/products?page=${page}&pageSize=25&q=${encodeURIComponent(q)}&category=${category}`);
      if (n === request.current) {
        setRows(r.data || []);
        setCount(r.count || 0);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      if (n === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(load, 200);
    window.addEventListener('partcast:queue', load);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('partcast:queue', load);
    };
  }, [q, category, page]);
  const total = cart.reduce((s, l) => s + lineCents(l.quantity,l.unit_price), 0) / 100;
  const balance = credit ? Math.round((total - Number(paid)) * 100) / 100 : 0;
  function add(part) {
    if (busy || operation.current) return;
    setError('');
    setCart(current => {
      const found = current.find(l => l.product_id === part.id);
      if (found) return current.map(l => l.product_id === part.id ? {
        ...l,
        quantity: String(Math.round((Number(l.quantity || 0) + 1) * 100) / 100)
      } : l);
      if (current.length >= 100) {
        setError('Choose up to 100 different parts.');
        return current;
      }
      return [...current, {
        product_id: part.id,
        product: part,
        quantity: '1',
        unit_price: String(mode === 'sale' ? part.selling_price || 0 : part.unit_cost || 0)
      }];
    });
  }
  function update(id, key, value) {
    setError('');
    setCart(current => current.map(l => l.product_id === id ? {
      ...l,
      [key]: value
    } : l));
  }
  function switchMode(value) {
    if (cart.length) {
      setError('Finish this basket or clear it before changing between a sale and a delivery.');
      return;
    }
    setMode(value);
    setCredit(false);
    setError('');
  }
  async function lookup(code) {
    setScan(false);
    setError('');
    try {
      const r = await api.get(`/api/barcode/${encodeURIComponent(code)}`);
      if (r.product) {
        setUnknown('');
        add(r.product);
      } else setUnknown(code);
    } catch (e) {
      setError(e.message);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (guard.current) return;
    setError('');
    if (!cart.length) {
      setError('Choose at least one part below.');
      return;
    }
    for (const l of cart) {
      if (!validAmount(l.quantity, true) || !validAmount(l.unit_price)) {
        setError('Check each quantity and price. Use positive quantities and up to 2 decimal places.');
        return;
      }
    }
    if (!Number.isFinite(total) || total >= 1e12) {
      setError('The total is too large.');
      return;
    }
    if (credit && (customer.trim().length < 2 || !validAmount(paid) || Number(paid) > total)) {
      setError('Enter the customer name and a payment between 0 and the sale total.');
      return;
    }
    if (due && due < today()) {
      setError('Choose a due date today or later.');
      return;
    }
    guard.current = true;
    setBusy(true);
    const payload = {
      kind: 'batch',
      tx_type: mode,
      lines: cart.map(({
        product_id,
        quantity,
        unit_price
      }) => ({
        product_id,
        quantity: Number(quantity),
        unit_price: Number(unit_price)
      })),
      customer_name: customer.trim() || null,
      phone: phone.trim() || null,
      is_credit: mode === 'sale' && credit,
      paid_amount: mode === 'sale' && credit ? Number(paid) : 0,
      due_date: credit ? due || null : null,
      notes: note.trim() || null,
      reference_no: reference.trim() || null,
      supplier_id: mode === 'stock_in' ? supplier || null : null
    };
    if (!operation.current) operation.current = {
      client_operation_id: crypto.randomUUID(),
      occurred_at: new Date().toISOString(),
      ...payload
    };
    try {
      const r = await api.post('/api/inventory/batch', operation.current);
      setCart([]);
      setCustomer('');
      setPhone('');
      setPaid('0');
      setDue('');
      setNote('');
      setReference('');
      setCredit(false);
      operation.current = null;
      setToast({
        message: r.queued ? 'Saved on this device. Stock and customer utang will send together when internet returns.' : mode === 'sale' ? 'Sale saved. Stock and customer balance updated.' : 'Delivery saved. All selected parts received.'
      });
      load();
    } catch (e) {
      setError(e.message);
      if (e.status >= 400 && e.status < 500) operation.current = null;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return <>
 <PageHeader title={t("Sell or receive")} subtitle={t("Choose several parts, check your basket, then save once.")} />
 <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t("Sale or delivery")}><button className={mode === 'sale' ? 'btn-primary' : 'btn-secondary'} aria-pressed={mode === 'sale'} onClick={() => switchMode('sale')} disabled={busy || !!operation.current}><ShoppingCart size={18} />{t("Sell parts")}</button><button className={mode === 'stock_in' ? 'btn-primary' : 'btn-secondary'} aria-pressed={mode === 'stock_in'} onClick={() => switchMode('stock_in')} disabled={busy || !!operation.current}><PackageCheck size={18} />{t("Receive delivery")}</button></div>
 {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{t(error)}</p>}
 {operation.current && !busy && <p className="mb-4 text-amber-800">{t("This save is waiting for confirmation. Choose Confirm again to retry the same basket.")}</p>}
 <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
 <section className="panel p-4 sm:p-5"><h2 className="mb-3 text-lg font-bold">{t("1. Choose your parts")}</h2>
 <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1"><span className="label">{t("Find a part")}</span><input className="input" placeholder={t("Name, part number, or barcode")} value={q} onChange={e => {
              setQ(e.target.value);
              setPage(1);
            }} /></label><button className="btn-secondary self-end" disabled={busy || !!operation.current} onClick={() => setScan(true)}><ScanLine size={18} />{t("Scan")}</button></div>
 <label className="mt-3 block"><span className="label">{t("Category")}</span><select aria-label={t("Category")} className="input" value={category} onChange={e => {
            setCategory(e.target.value);
            setPage(1);
          }}>{categories.map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}</select></label>
 {unknown && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p>{t("No part is saved with barcode ")}{unknown}.</p>{canAddPart ? <Link className="btn-secondary mt-3" to={`/inventory?newBarcode=${encodeURIComponent(unknown)}`}>{t("Add this part")}</Link> : <p className="mt-2 text-sm">{t("Ask the owner to add this part to Inventory first.")}</p>}</div>}
 <p className="my-4 text-sm text-slate-500" aria-live="polite">{loading ? t('Finding parts…') : t("{v0} parts found", {
            v0: count
          })}</p>
 {cart.length > 0 && <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white p-3 shadow-sm xl:hidden"><div><p className="text-sm font-semibold">{t('Basket: {v0} different parts',{v0:cart.length})}</p><p className="font-bold">{money(total)}</p></div><a className="btn-primary" href="#store-basket">{t('Review basket')}</a></div>}
 <div className="grid gap-3 sm:grid-cols-2">{rows.map(p => <article key={p.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex gap-3"><ProductThumbnail product={p} /><div className="min-w-0 flex-1"><h3 className="break-words font-bold">{p.description}</h3><p className="mt-1 text-sm text-slate-500">{p.part_number || t('No part number')}</p><p className="mt-2 text-sm">{p.current_stock} {p.unit || t('units')}{t(" available · ")}{money(mode === 'sale' ? p.selling_price : p.unit_cost)}</p></div></div><button className="btn-secondary mt-auto w-full" onClick={() => add(p)} disabled={busy || !!operation.current || mode === 'sale' && Number(p.current_stock) <= 0} aria-label={t("Add {v0} to basket",{v0:p.description})}><Plus size={16} />{t("Add to basket")}</button></article>)}</div>
 {!loading && !rows.length && <p className="py-8 text-center text-slate-500">{t("No parts found. Try another name or category.")}</p>}
 <Pagination page={page} pageSize={25} count={count} onPage={setPage} /></section>
 <form id="store-basket" tabIndex={-1} className="panel scroll-mt-4 p-4 sm:p-5" onSubmit={submit} noValidate><h2 className="mb-2 text-lg font-bold">{t("2. Check your basket")}</h2><p className="mb-4 text-sm text-slate-500">{mode === 'sale' ? t('Quantities below will be taken from stock.') : t('Quantities below will be added to stock.')}</p>
 <fieldset disabled={busy || !!operation.current} className="space-y-4">
 {!cart.length && <p className="rounded-xl bg-slate-50 p-5 text-center text-slate-500">{t("Tap a part to add it here.")}</p>}
 {cart.map(l => <article key={l.product_id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-2"><ProductThumbnail product={l.product} className="h-12 w-12" /><h3 className="min-w-0 flex-1 break-words font-semibold">{t(l.product.description)}</h3><button type="button" className="min-h-11 min-w-11 text-red-700" aria-label={t("Remove {v0} from basket", {
                v0: t(l.product.description)
              })} onClick={() => setCart(c => c.filter(x => x.product_id !== l.product_id))}><Trash2 size={18} /></button></div>
 <div className="grid grid-cols-2 gap-3"><label><span className="label">{t("Quantity")}</span><input className="input" type="number" required min="0.01" max="999999999999.99" step="0.01" inputMode="decimal" value={l.quantity} onChange={e => update(l.product_id, 'quantity', e.target.value)} /></label><label><span className="label">{mode === 'sale' ? t('Price per unit') : t('Cost per unit')}</span><input className="input" type="number" required min="0" max="999999999999.99" step="0.01" inputMode="decimal" value={l.unit_price} onChange={e => update(l.product_id, 'unit_price', e.target.value)} /></label></div>{mode==='sale'&&<p className="mt-2 text-sm text-slate-600">{t('Stock after this sale: {v0} {v1}',{v0:Number.isFinite(Number(l.quantity))?Math.round((Number(l.product.current_stock)-Number(l.quantity))*100)/100:'—',v1:l.product.unit||t('units')})}</p>}<p className="mt-2 text-right font-semibold">{money(lineCents(l.quantity,l.unit_price)/100)}</p></article>)}
 {cart.length > 0 && <button type="button" className="btn-secondary w-full" onClick={() => setCart([])}>{t("Clear basket")}</button>}
 {mode === 'sale' && <div className="border-t border-slate-200 pt-4"><label><span className="label">{t("Customer name ")}{credit ? '*' : t('(optional)')}</span><input className="input" maxLength={240} minLength={credit ? 2 : undefined} required={credit} value={customer} onChange={e => setCustomer(e.target.value)} /></label></div>}
 {mode === 'sale' && <><label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="h-5 w-5" checked={credit} onChange={e => setCredit(e.target.checked)} /><span className="font-semibold">{t("Customer will pay later (utang)")}</span></label>{credit && <div className="space-y-4 rounded-xl bg-slate-50 p-4"><label className="block"><span className="label">{t("Amount paid now (\u20B1)")}</span><input className="input" type="number" required min="0" max={Number.isFinite(total) ? total : 0} step="0.01" value={paid} onChange={e => setPaid(e.target.value)} /></label><label className="block"><span className="label">{t("Due date (optional)")}</span><input className="input" type="date" min={today()} value={due} onChange={e => setDue(e.target.value)} /></label><label className="block"><span className="label">{t("Customer phone (optional)")}</span><input className="input" type="tel" maxLength={80} value={phone} onChange={e => setPhone(e.target.value)} /></label><p className="font-semibold">{t("Remaining utang: ")}{money(balance)}</p></div>}</>}
 {mode === 'stock_in' && <label className="block"><span className="label">{t("Supplier (optional)")}</span><select className="input" value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">{t("No supplier selected")}</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
 <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">{t("Add a reference or note")}</summary><div className="mt-3 space-y-3"><label className="block"><span className="label">{t("Reference number")}</span><input className="input" maxLength={180} value={reference} onChange={e => setReference(e.target.value)} /></label><label className="block"><span className="label">{t("Description or note")}</span><textarea className="input" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label></div></details>
 </fieldset>
 <div className="my-5 flex justify-between border-t border-slate-200 pt-4 text-xl font-bold"><span>{t("Total")}</span><span>{money(total)}</span></div><button className="btn-primary w-full" disabled={busy || !cart.length}>{busy ? t('Saving…') : mode === 'sale' ? t('3. Confirm sale') : t('3. Confirm delivery')}</button><p className="mt-3 text-sm text-slate-500">{navigator.onLine ? t('All selected parts save together.') : t('This basket saves on this device and sends automatically when internet returns.')}</p>
 </form></div>
 <BarcodeScanner open={scan} onClose={() => setScan(false)} onScan={lookup} /><Toast toast={toast} onClose={() => setToast(null)} />
 </>;
}
