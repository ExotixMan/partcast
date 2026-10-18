import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ScanLine, Plus, Trash2, ShoppingCart, PackageCheck } from 'lucide-react';
import { api, prepareOffline } from '../lib/api.js';
import { categories, money, validAmount, today, lineCents, basketAmounts } from '../lib/store.js';
import {staffRoles} from '../lib/access.js';
import { ProductThumbnail } from '../components/ProductPhotos.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import {useAuth} from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import Toast from '../components/Toast.jsx';
export default function CounterPage() {
  useLocale();
  const {profile} = useAuth();
  const canAddPart = staffRoles.includes(profile?.role);
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
    [toast, setToast] = useState(null),
    [priceSaving, setPriceSaving] = useState('');
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
  const {total,balance,overpaid,validPayment} = basketAmounts(cart,{txType:mode,isCredit:credit,paidAmount:paid});
  const formattedTotal = total === null ? '—' : money(total);
  const incompletePrice = mode === 'sale' && cart.some(l=>!validAmount(l.unit_price,true));
  const paymentIssue = credit && (!validPayment || overpaid);
  const locked = busy || !!operation.current || !!priceSaving;
  function add(part) {
    if (locked) return;
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
        unit_price: mode === 'sale' ? validAmount(part.selling_price,true) ? String(part.selling_price) : '' : String(part.unit_cost || 0)
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
  async function savePrice(line) {
    if (guard.current || locked || !canAddPart) return;
    if (!validAmount(line.unit_price,true)) {
      setError('Enter a selling price greater than zero for every part.');
      return;
    }
    guard.current = true;
    setPriceSaving(line.product_id);
    setError('');
    try {
      const result = await api.patch(`/api/products/${line.product_id}`,{selling_price:Number(line.unit_price)});
      const price = result.product.selling_price;
      setRows(items=>items.map(p=>p.id===line.product_id?{...p,selling_price:price}:p));
      setCart(items=>items.map(l=>l.product_id===line.product_id?{...l,product:{...l.product,selling_price:price}}:l));
      await prepareOffline().catch(()=>{});
      setToast({message:'Price saved to inventory for future sales.'});
    } catch (e) {
      setError(e.message);
    } finally {
      guard.current = false;
      setPriceSaving('');
    }
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
      if (!validAmount(l.quantity, true) || !validAmount(l.unit_price,mode==='sale')) {
        setError(mode==='sale'?'Enter a quantity and selling price greater than zero for every part.':'Check each quantity and price. Use positive quantities and up to 2 decimal places.');
        return;
      }
    }
    if (total === null) {
      setError('The total is too large.');
      return;
    }
    if (credit && (customer.trim().length < 2 || paymentIssue)) {
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
 <div className="mb-5 grid grid-cols-2 gap-2 sm:flex" role="group" aria-label={t("Sale or delivery")}><button className={mode === 'sale' ? 'btn-primary px-2' : 'btn-secondary px-2'} aria-pressed={mode === 'sale'} onClick={() => switchMode('sale')} disabled={locked}><ShoppingCart size={18} className="shrink-0" />{t("Sell parts")}</button><button className={mode === 'stock_in' ? 'btn-primary px-2' : 'btn-secondary px-2'} aria-pressed={mode === 'stock_in'} onClick={() => switchMode('stock_in')} disabled={locked}><PackageCheck size={18} className="shrink-0" />{t("Receive delivery")}</button></div>
 {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{t(error)}</p>}
 {operation.current && !busy && <p className="mb-4 text-amber-800">{t("This save is waiting for confirmation. Choose Confirm again to retry the same basket.")}</p>}
 <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
 <section className="counter-catalog panel p-3 sm:p-4" aria-label={t('Choose parts')}><h2 className="mb-3 text-lg font-bold">{t("1. Choose your parts")}</h2>
 <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1"><span className="label">{t("Find a part")}</span><input className="input" placeholder={t("Name, part number, or barcode")} value={q} onChange={e => {
              setQ(e.target.value);
              setPage(1);
            }} /></label><button className="btn-secondary self-end" disabled={locked} onClick={() => setScan(true)}><ScanLine size={18} />{t("Scan")}</button></div>
 <label className="mt-3 block"><span className="label">{t("Category")}</span><select aria-label={t("Category")} className="input" value={category} onChange={e => {
            setCategory(e.target.value);
            setPage(1);
          }}>{categories.map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}</select></label>
 {unknown && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p>{t("No part is saved with barcode ")}{unknown}.</p>{canAddPart ? <Link className="btn-secondary mt-3" to={`/inventory?newBarcode=${encodeURIComponent(unknown)}`}>{t("Add this part")}</Link> : <p className="mt-2 text-sm">{t("Ask the owner to add this part to Inventory first.")}</p>}</div>}
 <p className="my-4 text-sm text-slate-500" aria-live="polite">{loading ? t('Finding parts…') : t("{v0} parts found", {
            v0: count
          })}</p>
 <div className="counter-parts-grid">{rows.map(p => {
   const needsPrice=mode==='sale'&&!validAmount(p.selling_price,true);
   const inBasket=cart.find(l=>l.product_id===p.id);
   const soldOut=mode==='sale'&&Number(p.current_stock)<=0;
   return <article key={p.id} className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-white p-2.5 ${inBasket?'border-red-300':'border-slate-200'}`}>
    <div className="flex justify-center"><ProductThumbnail product={p} className="h-16 w-16" /></div>
    <div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold leading-snug">{p.description}</h3><p className="mt-1 break-all text-sm text-slate-600">{p.part_number || t('No part number')}</p></div>
    <p className={`break-words text-sm ${soldOut?'text-red-700':'text-slate-600'}`}>{soldOut?t('Out of stock'):t('{v0} {v1} in stock',{v0:p.current_stock,v1:p.unit||t('units')})}</p>
    <p className={`break-words font-bold ${needsPrice?'text-amber-800':''}`}>{needsPrice?t('Price needed'):money(mode==='sale'?p.selling_price:p.unit_cost)}</p>
    {inBasket&&<p className="break-words text-sm font-semibold text-red-700">{t('{v0} in basket',{v0:inBasket.quantity||'—'})}</p>}
    <button className="btn-secondary mt-auto w-full gap-1 px-2" onClick={() => add(p)} disabled={locked || soldOut} aria-label={t("Add {v0} to basket",{v0:p.description})}><Plus size={16} className="shrink-0" />{t('Add')}</button>
   </article>;
 })}</div>
 {!loading && !rows.length && <p className="py-8 text-center text-slate-500">{t("No parts found. Try another name or category.")}</p>}
 <Pagination page={page} pageSize={25} count={count} onPage={setPage} /></section>
 <form id="store-basket" tabIndex={-1} className="panel scroll-mt-24 p-3 sm:p-4" onSubmit={submit} noValidate><h2 className="mb-2 text-lg font-bold">{t("2. Check your basket")}</h2><p className="mb-4 text-sm text-slate-500">{mode === 'sale' ? t('Quantities below will be taken from stock.') : t('Quantities below will be added to stock.')}</p>
 <fieldset disabled={locked} className="space-y-4">
 {!cart.length && <p className="rounded-xl bg-slate-50 p-5 text-center text-slate-500">{t("Tap a part to add it here.")}</p>}
 {cart.map(l => <article key={l.product_id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-2"><ProductThumbnail product={l.product} className="h-12 w-12" /><h3 className="min-w-0 flex-1 break-words font-semibold">{t(l.product.description)}</h3><button type="button" className="min-h-11 min-w-11 text-red-700" aria-label={t("Remove {v0} from basket", {
                v0: t(l.product.description)
              })} onClick={() => setCart(c => c.filter(x => x.product_id !== l.product_id))}><Trash2 size={18} /></button></div>
 <div className="mt-3 grid grid-cols-2 items-end gap-2"><label className="min-w-0"><span className="label">{t("Quantity")}</span><input className="input" type="number" required min="0.01" max="999999999999.99" step="0.01" inputMode="decimal" value={l.quantity} onChange={e => update(l.product_id, 'quantity', e.target.value)} /></label><label className="min-w-0"><span className="label">{mode === 'sale' ? t('Price per unit') : t('Cost per unit')}</span><input className="input" type="number" required min={mode==='sale'?'0.01':'0'} max="999999999999.99" step="0.01" inputMode="decimal" value={l.unit_price} placeholder={mode==='sale'?t('Enter price'):undefined} aria-invalid={mode==='sale'&&!validAmount(l.unit_price,true)||undefined} aria-describedby={mode==='sale'&&!validAmount(l.unit_price,true)?`price-help-${l.product_id}`:undefined} onChange={e => update(l.product_id, 'unit_price', e.target.value)} /></label></div>
 {mode==='sale'&&!validAmount(l.unit_price,true)&&<p id={`price-help-${l.product_id}`} className="mt-2 text-sm font-semibold text-amber-800">{canAddPart?t('Enter the selling price before confirming this sale.'):t('Ask the owner for the selling price, then enter it here.')}</p>}
 {mode==='sale'&&canAddPart&&validAmount(l.unit_price,true)&&Number(l.unit_price)!==Number(l.product.selling_price)&&<div className="mt-3"><button type="button" className="btn-secondary w-full text-sm" onClick={()=>savePrice(l)}>{priceSaving===l.product_id?t('Saving price…'):t('Save price to inventory')}</button><p className="mt-1 text-sm text-slate-500">{t('Use this price for future sales too. Otherwise, it applies to this sale only.')}</p></div>}
 {mode==='sale'&&<p className="mt-2 text-sm text-slate-600">{validAmount(l.quantity,true)&&Number(l.quantity)>Number(l.product.current_stock)?t('Not enough stock. Reduce the quantity.'):t('Stock after this sale: {v0} {v1}',{v0:validAmount(l.quantity,true)?Math.round((Number(l.product.current_stock)-Number(l.quantity))*100)/100:'—',v1:l.product.unit||t('units')})}</p>}<p className="mt-2 text-right font-semibold">{validAmount(l.quantity,true)&&validAmount(l.unit_price,mode==='sale')?money(lineCents(l.quantity,l.unit_price)/100):'—'}</p></article>)}
 {cart.length > 0 && <button type="button" className="btn-secondary w-full" onClick={() => setCart([])}>{t("Clear basket")}</button>}
 {mode === 'sale' && <div className="border-t border-slate-200 pt-4"><label><span className="label">{t("Customer name ")}{credit ? '*' : t('(optional)')}</span><input className="input" maxLength={240} minLength={credit ? 2 : undefined} required={credit} value={customer} onChange={e => setCustomer(e.target.value)} /></label></div>}
 {mode === 'sale' && <><label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="h-5 w-5" checked={credit} onChange={e => setCredit(e.target.checked)} /><span className="font-semibold">{t("Customer will pay later (utang)")}</span></label>{credit && <div className="space-y-4 rounded-xl bg-slate-50 p-3"><label className="block"><span className="label">{t("Amount paid now (\u20B1)")}</span><input className="input" type="number" inputMode="decimal" required min="0" max={total===null?undefined:total} step="0.01" value={paid} aria-invalid={paymentIssue||undefined} aria-describedby={paymentIssue?'store-payment-error':undefined} onChange={e => setPaid(e.target.value)} /></label>
 {paymentIssue&&<p id="store-payment-error" role="alert" className="text-sm font-semibold text-red-700">{overpaid?t('Amount paid is higher than the updated total. Check the payment or the prices.'):t('Enter an amount paid of 0 or more, with up to 2 decimal places.')}</p>}
 <label className="block"><span className="label">{t("Due date (optional)")}</span><input className="input" type="date" min={today()} value={due} onChange={e => setDue(e.target.value)} /></label><label className="block"><span className="label">{t("Customer phone (optional)")}</span><input className="input" type="tel" maxLength={80} value={phone} onChange={e => setPhone(e.target.value)} /></label><p className="font-semibold" aria-live="polite">{t("Remaining utang: ")}{balance===null?'—':money(balance)}</p>{balance===null&&<p className="text-sm text-slate-600">{t('Complete the prices and check the payment to see the remaining utang.')}</p>}</div>}</>}
 {mode === 'stock_in' && <label className="block"><span className="label">{t("Supplier (optional)")}</span><select className="input" value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">{t("No supplier selected")}</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
 <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">{t("Add a reference or note")}</summary><div className="mt-3 space-y-3"><label className="block"><span className="label">{t("Reference number")}</span><input className="input" maxLength={180} value={reference} onChange={e => setReference(e.target.value)} /></label><label className="block"><span className="label">{t("Description or note")}</span><textarea className="input" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label></div></details>
 </fieldset>
 <div className="my-5 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4 text-xl font-bold"><span>{t("Total")}</span><span>{formattedTotal}</span></div>
 {cart.length>0&&total===null&&<p className="mb-3 text-sm font-semibold text-amber-800">{incompletePrice?t('Add a selling price for every part to continue.'):t('Check the quantities and prices before saving.')}</p>}
 <button className="btn-primary w-full" disabled={busy || !!priceSaving || !cart.length || total===null || paymentIssue}>{busy ? t('Saving…') : mode === 'sale' ? t('3. Confirm sale') : t('3. Confirm delivery')}</button><p className="mt-3 text-sm text-slate-500">{navigator.onLine ? t('All selected parts save together.') : t('This basket saves on this device and sends automatically when internet returns.')}</p>
 </form></div>
 {cart.length>0&&<><div className="h-24 xl:hidden" aria-hidden="true" /><div className="counter-basket-shortcut fixed inset-x-0 z-20 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 lg:left-64 xl:hidden"><div className="min-w-0"><p className="text-sm text-slate-600">{t('{v0} parts in basket',{v0:cart.length})}</p><p className="break-words font-bold">{formattedTotal}</p></div><a className="btn-primary shrink-0" href="#store-basket">{t('View basket')}</a></div></>}
 <BarcodeScanner open={scan} onClose={() => setScan(false)} onScan={lookup} /><Toast toast={toast} onClose={() => setToast(null)} />
 </>;
}
