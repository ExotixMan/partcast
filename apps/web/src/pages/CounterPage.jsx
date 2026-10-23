import Form from '../components/Form.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ScanLine, Search, Trash2, ShoppingCart, PackageCheck, Wrench } from 'lucide-react';
import { api, prepareOffline } from '../lib/api.js';
import { money, validAmount, validQuantity, today, lineCents, basketAmounts } from '../lib/store.js';
import {staffRoles} from '../lib/access.js';
import { ProductThumbnail } from '../components/ProductPhotos.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import {useAuth} from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import Toast from '../components/Toast.jsx';
import CounterCategories from '../components/CounterCategories.jsx';
import CounterProductCard from '../components/CounterProductCard.jsx';
import './counter.css';
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
    [catalogError,setCatalogError]=useState(''),
    [toast, setToast] = useState(null),
    [priceSaving, setPriceSaving] = useState(''),
    [reviewedPrices, setReviewedPrices] = useState(''),
    [basketVisible, setBasketVisible] = useState(false);
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
  useEffect(() => {
    const basket = document.getElementById('store-basket');
    if (!basket || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setBasketVisible(entry.isIntersecting), {
      rootMargin: '-80px 0px -160px 0px'
    });
    observer.observe(basket);
    return () => observer.disconnect();
  }, []);
  async function load() {
    const n = ++request.current;
    setLoading(true);
    setCatalogError('');
    try {
      const r = await api.get(`/api/products?page=${page}&pageSize=25&q=${encodeURIComponent(q)}&category=${category}`);
      if(!Array.isArray(r.data)||!Number.isFinite(r.count))throw new Error('The store returned incomplete information. Please try again.');
      if (n === request.current) {
        setRows(r.data || []);
        setCount(r.count || 0);
      }
    } catch (e) {
      if(n===request.current)setCatalogError(e.message);
    } finally {
      if (n === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    request.current++;
    const timer = setTimeout(load, 200);
    window.addEventListener('partcast:queue', load);
    return () => {
      request.current++;
      clearTimeout(timer);
      window.removeEventListener('partcast:queue', load);
    };
  }, [q, category, page]);
  const {total,balance,overpaid,validPayment,zeroSaleTotal} = basketAmounts(cart,{txType:mode,isCredit:credit,paidAmount:paid});
  const formattedTotal = total === null ? '—' : money(total);
  const basketLabel = cart.length===1 ? t('1 part in basket') : t('{v0} parts in basket',{v0:cart.length});
  const incompletePrice = mode === 'sale' && cart.some(l=>!validAmount(l.unit_price,true));
  const incompleteQuantity = cart.some(l=>!validQuantity(l.quantity,true));
  const lowPrices = mode === 'sale' ? cart.filter(l=>validAmount(l.unit_price,true)&&Number(l.unit_price)<1) : [];
  const priceReviewKey = JSON.stringify(lowPrices.map(l=>[l.product_id,l.quantity,l.unit_price]));
  const needsPriceReview = lowPrices.length>0 && reviewedPrices!==priceReviewKey;
  useEffect(()=>setReviewedPrices(''),[priceReviewKey]);
  const paymentIssue = credit && (!validPayment || overpaid);
  const locked = busy || !!operation.current || !!priceSaving;
  function add(part) {
    if (locked) return;
    setError('');
    setCart(current => {
      const found = current.find(l => l.product_id === part.id);
      if (found) return current.map(l => l.product_id === part.id ? {
        ...l,
        quantity: String((validQuantity(l.quantity) ? Number(l.quantity) : 0) + 1)
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
    if (Number(line.unit_price)<1 && needsPriceReview) {
      setError('Check the low selling prices before saving.');
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
      if (!validQuantity(l.quantity, true)) {
        setError('Enter a whole-number quantity of 1 or more.');
        return;
      }
      if (!validAmount(l.unit_price,mode==='sale')) {
        setError(mode==='sale'?'Enter a selling price greater than zero for every part.':'Enter a cost of 0 or more, with up to 2 decimal places.');
        return;
      }
    }
    if (needsPriceReview) {
      setError('Check the low selling prices before saving.');
      return;
    }
    if (total === null) {
      setError('The total is too large.');
      return;
    }
    if(zeroSaleTotal){setError('Each part in a sale must total at least ₱0.01. Check the quantities and prices.');return;}
    if (credit && (customer.trim().length < 2 || paymentIssue)) {
      setError('Enter the customer name and a payment between 0 and the sale total.');
      return;
    }
    if (!operation.current&&mode==='sale'&&credit&&balance>0&&due && due < today()) {
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
      due_date: mode==='sale'&&credit&&balance>0 ? due || null : null,
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
  return <div className="counter-page">
 <div className="counter-heading">
 <PageHeader title={t("Sell or receive")} subtitle={t("Choose parts, check the total, then confirm.")} />
 <div className="counter-mode-switch" role="group" aria-label={t('Sale or delivery')}>
  <button type="button" className="counter-mode" aria-label={t('Sell parts')} aria-pressed={mode === 'sale'} onClick={() => switchMode('sale')} disabled={locked}><ShoppingCart size={24} aria-hidden="true" /><span>{t('Sell parts')}<small aria-hidden="true">{t('Stock goes out')}</small></span></button>
  <button type="button" className="counter-mode" aria-label={t('Receive delivery')} aria-pressed={mode === 'stock_in'} onClick={() => switchMode('stock_in')} disabled={locked}><PackageCheck size={24} aria-hidden="true" /><span>{t('Receive delivery')}<small aria-hidden="true">{t('Stock comes in')}</small></span></button>
 </div></div>
 {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{t(error)}</p>}
 {operation.current && !busy && <p className="mb-4 text-amber-800">{t("This save is waiting for confirmation. Choose Confirm again to retry the same basket.")}</p>}
 <div className="counter-workspace">
 <section className="counter-catalog" aria-label={t('Choose parts')}><h2 className="counter-browse-heading"><span className="counter-step" aria-hidden="true"><Wrench size={18} /></span>{t('1. Choose your parts')}</h2>
 {catalogError&&<div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>{t(catalogError)}</p><button type="button" className="btn-secondary mt-2" disabled={loading} onClick={load}>{t('Try again')}</button></div>}
 <div className="counter-search-panel"><label className="label" htmlFor="counter-part-search">{t('Find a part')}</label><div className="counter-search-row"><div className="counter-search-field min-w-0 flex-1"><Search size={20} aria-hidden="true" /><input id="counter-part-search" className="input" type="search" placeholder={t('Name, part number, or barcode')} value={q} onChange={e => {
              setQ(e.target.value);
              setPage(1);
            }} /></div><button type="button" className="btn-secondary" disabled={locked} onClick={() => setScan(true)}><ScanLine size={20} aria-hidden="true" /><span>{t('Scan')}</span></button></div></div>
 <h3 className="text-base font-semibold">{t('Browse categories')}</h3>
 <CounterCategories value={category} onChange={value => { setCategory(value); setPage(1); }} disabled={locked} />
 {unknown && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p>{t("No part is saved with barcode ")}{unknown}.</p>{canAddPart ? <Link className="btn-secondary mt-3" to={`/inventory?newBarcode=${encodeURIComponent(unknown)}`}>{t("Add this part")}</Link> : <p className="mt-2 text-sm">{t("Ask the owner to add this part to Inventory first.")}</p>}</div>}
 <div className="counter-results-heading"><h3>{t('Parts')}</h3><p aria-live="polite">{loading ? t('Finding parts…') : count===1 ? t('1 part found') : t("{v0} parts found", {
            v0: count
          })}</p></div>
 <div className="counter-parts-grid">{rows.map(p => {
   const inBasket=cart.find(l=>l.product_id===p.id);
   return <CounterProductCard key={p.id} product={p} mode={mode} quantity={inBasket?.quantity} disabled={locked} onAdd={add} />;
 })}</div>
 {!loading && !catalogError && !rows.length && <p className="py-8 text-center text-slate-500">{t("No parts found. Try another name or category.")}</p>}
 <Pagination page={page} pageSize={25} count={count} onPage={setPage} /></section>
 <Form id="store-basket" tabIndex={-1} className="counter-checkout scroll-mt-24 p-4" onSubmit={submit} noValidate><div className="counter-checkout-heading"><h2><ShoppingCart size={22} aria-hidden="true" />{t('2. Check your basket')}</h2><span className="badge bg-white text-slate-700">{basketLabel}</span></div>
 <fieldset disabled={locked} className="space-y-4">
 {!cart.length && <div className="counter-basket-empty"><span aria-hidden="true"><ShoppingCart size={30} strokeWidth={1.5} /></span><p>{t('Tap a part to add it here.')}</p></div>}
 {cart.map(l => <article key={l.product_id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-2"><ProductThumbnail product={l.product} className="h-12 w-12" /><h3 className="min-w-0 flex-1 break-words font-semibold">{t(l.product.description)}</h3><button type="button" className="min-h-11 min-w-11 text-red-700" aria-label={t("Remove {v0} from basket", {
                v0: t(l.product.description)
              })} onClick={() => setCart(c => c.filter(x => x.product_id !== l.product_id))}><Trash2 size={18} /></button></div>
 <div className="mt-3 grid grid-cols-2 items-end gap-2"><label className="min-w-0"><span className="label">{t("Quantity")}</span><input className="input" type="number" required min="1" max="999999999999" step="1" inputMode="numeric" value={l.quantity} aria-invalid={!validQuantity(l.quantity,true)||undefined} aria-describedby={!validQuantity(l.quantity,true)?`quantity-help-${l.product_id}`:undefined} onChange={e => update(l.product_id, 'quantity', e.target.value)} /></label><label className="min-w-0"><span className="label">{mode === 'sale' ? t('Price per unit') : t('Cost per unit')}</span><input className="input" type="number" required min={mode==='sale'?'0.01':'0'} max="999999999999.99" step="0.01" inputMode="decimal" value={l.unit_price} placeholder={mode==='sale'?t('Enter price'):undefined} aria-invalid={!validAmount(l.unit_price,mode==='sale')||undefined} aria-describedby={!validAmount(l.unit_price,mode==='sale')?`price-help-${l.product_id}`:undefined} onChange={e => update(l.product_id, 'unit_price', e.target.value)} /></label></div>
 {!validQuantity(l.quantity,true)&&<p id={`quantity-help-${l.product_id}`} role="alert" className="mt-2 text-sm font-semibold text-red-700">{t('Enter a whole-number quantity of 1 or more.')}</p>}
 {mode==='stock_in'&&!validAmount(l.unit_price)&&<p id={`price-help-${l.product_id}`} className="mt-2 text-sm font-semibold text-red-700">{t('Enter a cost of 0 or more, with up to 2 decimal places.')}</p>}
 {mode==='sale'&&!validAmount(l.unit_price,true)&&<p id={`price-help-${l.product_id}`} className="mt-2 text-sm font-semibold text-amber-800">{canAddPart?t('Enter the selling price before confirming this sale.'):t('Ask the owner for the selling price, then enter it here.')}</p>}
 {mode==='sale'&&canAddPart&&validAmount(l.unit_price,true)&&Number(l.unit_price)!==Number(l.product.selling_price)&&<details className="group mt-2"><summary className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">{t('Use as regular price')}<ChevronDown size={16} aria-hidden="true" className="ml-auto shrink-0 group-open:rotate-180" /></summary><p className="mb-2 text-sm text-slate-600">{t('Use this price for future sales too. Otherwise, it applies to this sale only.')}</p><button type="button" className="btn-secondary w-full text-sm" onClick={()=>savePrice(l)}>{priceSaving===l.product_id?t('Saving price…'):t('Save price to inventory')}</button></details>}
 <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-2">{mode==='sale'&&<p className="text-sm text-slate-600">{validQuantity(l.quantity,true)&&Number(l.quantity)>Number(l.product.current_stock)?t('Not enough stock. Reduce the quantity.'):t('Stock after this sale: {v0} {v1}',{v0:validQuantity(l.quantity,true)?Math.round((Number(l.product.current_stock)-Number(l.quantity))*100)/100:'—',v1:l.product.unit||t('units')})}</p>}<p className="ml-auto font-semibold">{validQuantity(l.quantity,true)&&validAmount(l.unit_price,mode==='sale')?money(lineCents(l.quantity,l.unit_price)/100):'—'}</p></div></article>)}
 {cart.length > 0 && <button type="button" className="btn-secondary w-full" onClick={() => setCart([])}>{t("Clear basket")}</button>}
 {mode === 'sale' && <><label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="h-5 w-5" checked={credit} onChange={e => setCredit(e.target.checked)} /><span className="font-semibold">{t("Customer will pay later (utang)")}</span></label>{credit && <div className="space-y-4 rounded-xl bg-slate-50 p-3"><label className="block"><span className="label">{t('Customer name *')}</span><input className="input" maxLength={240} minLength={2} required value={customer} onChange={e => setCustomer(e.target.value)} /></label><label className="block"><span className="label">{t("Amount paid now (\u20B1)")}</span><input className="input" type="number" inputMode="decimal" required min="0" max={total===null?undefined:total} step="0.01" value={paid} aria-invalid={paymentIssue||undefined} aria-describedby={paymentIssue?'store-payment-error':undefined} onChange={e => setPaid(e.target.value)} /></label>
 {paymentIssue&&<p id="store-payment-error" role="alert" className="text-sm font-semibold text-red-700">{overpaid?t('Amount paid is higher than the updated total. Check the payment or the prices.'):t('Enter an amount paid of 0 or more, with up to 2 decimal places.')}</p>}
 <label className="block"><span className="label">{t("Due date (optional)")}</span><input className="input" type="date" min={today()} value={due} onChange={e => setDue(e.target.value)} /></label><label className="block"><span className="label">{t("Customer phone (optional)")}</span><input className="input" type="tel" maxLength={80} value={phone} onChange={e => setPhone(e.target.value)} /></label><p className="font-semibold" aria-live="polite">{t("Remaining utang: ")}{balance===null?'—':money(balance)}</p>{balance===null&&<p className="text-sm text-slate-600">{t('Complete the prices and check the payment to see the remaining utang.')}</p>}</div>}</>}
 {mode === 'stock_in' && <label className="block"><span className="label">{t("Supplier (optional)")}</span><select className="input" value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">{t("No supplier selected")}</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
 <details className="group rounded-xl border border-slate-200 p-3"><summary className="flex min-h-11 items-center gap-2 font-semibold">{mode==='sale'?t('Customer, reference or note'):t('Add a reference or note')}<ChevronDown size={18} aria-hidden="true" className="ml-auto shrink-0 group-open:rotate-180" /></summary><div className="mt-3 space-y-3">{mode==='sale'&&!credit&&<label className="block"><span className="label">{t('Customer name (optional)')}</span><input className="input" maxLength={240} value={customer} onChange={e=>setCustomer(e.target.value)} /></label>}<label className="block"><span className="label">{t("Reference number")}</span><input className="input" maxLength={180} value={reference} onChange={e => setReference(e.target.value)} /></label><label className="block"><span className="label">{t("Description or note")}</span><textarea className="input" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label></div></details>
 {lowPrices.length>0&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900"><div className="flex items-start gap-2"><AlertTriangle size={20} aria-hidden="true" className="mt-1 shrink-0" /><div className="min-w-0"><p className="font-semibold">{t('Check the low selling price')}</p><p id="low-price-help" className="mt-1 text-sm">{t('This price is below ₱1. Please check before saving.')}</p><ul className="mt-2 space-y-1 text-sm">{lowPrices.map(l=><li key={l.product_id} className="break-words">{l.product.description} · <strong>{money(l.unit_price)}</strong></li>)}</ul></div></div><label className="mt-3 flex min-h-12 items-center gap-3 rounded-lg border border-amber-300 p-2 font-semibold"><input type="checkbox" className="h-5 w-5 shrink-0" checked={!needsPriceReview} aria-describedby="low-price-help" onChange={e=>{setReviewedPrices(e.target.checked?priceReviewKey:'');setError('');}} /><span>{t('I checked these selling prices.')}</span></label></div>}
 </fieldset>
 <div className="my-5 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4 text-xl font-bold"><span>{t("Total")}</span><span>{formattedTotal}</span></div>
 {cart.length>0&&total===null&&!incompleteQuantity&&<p className="mb-3 text-sm font-semibold text-amber-800">{incompletePrice?t('Add a selling price for every part to continue.'):t('Check the quantities and prices before saving.')}</p>}
 {zeroSaleTotal&&!incompleteQuantity&&<p role="alert" className="mb-3 text-sm font-semibold text-red-700">{t('Each part in a sale must total at least ₱0.01. Check the quantities and prices.')}</p>}
 <button className="btn-primary w-full" disabled={busy || !!priceSaving || !cart.length || total===null || zeroSaleTotal || paymentIssue || needsPriceReview}>{busy ? t('Saving…') : mode === 'sale' ? t('3. Confirm sale') : t('3. Confirm delivery')}</button><p className="mt-3 text-sm text-slate-500">{navigator.onLine ? t('All selected parts save together.') : t('This basket saves on this device and sends automatically when internet returns.')}</p>
 </Form></div>
 {cart.length>0&&!basketVisible&&<><div className="h-24 xl:hidden" aria-hidden="true" /><div className="counter-basket-shortcut fixed inset-x-0 z-20 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 lg:left-64 xl:hidden"><div className="min-w-0"><p className="text-sm text-slate-600">{basketLabel}</p><p className="break-words font-bold">{formattedTotal}</p></div><a className="btn-primary shrink-0" href="#store-basket">{t('View basket')}</a></div></>}
 <BarcodeScanner open={scan} onClose={() => setScan(false)} onScan={lookup} /><Toast toast={toast} onClose={() => setToast(null)} />
 </div>;
}
