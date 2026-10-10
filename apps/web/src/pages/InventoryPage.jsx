import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, CheckCircle2, Info, Package, Pencil, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import Loading from '../components/Loading.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { categories, barcodeValid } from '../lib/store.js';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import ProductPhotos, { ProductThumbnail } from '../components/ProductPhotos.jsx';
import Toast from '../components/Toast.jsx';
const blankProduct = {
  category: 'parts',
  barcode: '',
  search_aliases: [],
  part_number: '',
  sub_number: '',
  description: '',
  brand: '',
  unit: 'pc',
  location: '',
  current_stock: 0,
  minimum_stock: 1,
  safety_stock: 1,
  unit_cost: 0,
  selling_price: 0
};
const blankMove = {
  product_id: '',
  tx_type: 'stock_in',
  quantity: 1,
  unit_cost: '',
  unit_price: '',
  reference_no: '',
  supplier_id: '',
  customer_name: '',
  total_amount: '',
  notes: ''
};
const stockFilters = [{
  value: 'all',
  label: 'All parts'
}, {
  value: 'low',
  label: 'Running low'
}, {
  value: 'out',
  label: 'Out of stock'
}];
const formatQuantity = value => Number(value || 0).toLocaleString(undefined, {
  maximumFractionDigits: 2
});
const validStockNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 999999999999.99 && Number(number.toFixed(2)) === number;
};
function Field({
  name,
  label,
  errors = {},
  hint,
  children,
  className = ''
}) {
  useLocale();
  return <div className={className}>
    <label htmlFor={name} className="label">{t(label)}</label>
    {children}
    {errors[name] ? <p id={`${name}-message`} className="mt-2 text-sm font-medium text-red-700">{t(errors[name])}</p> : hint && <p id={`${name}-message`} className="mt-2 text-sm leading-5 text-slate-500">{t(hint)}</p>}
  </div>;
}
export default function InventoryPage() {
  useLocale();
  const [params] = useSearchParams();
  const action = params.get('action');
  const intent = action === 'sale' ? 'sale' : action === 'stock_in' ? 'stock_in' : null;
  const [offline, setOffline] = useState(!navigator.onLine);
  const [rows, setRows] = useState([]),
    [count, setCount] = useState(0),
    [page, setPage] = useState(1),
    [q, setQ] = useState(() => params.get('q') || ''),
    [status, setStatus] = useState(() => stockFilters.some(filter => filter.value === params.get('status')) ? params.get('status') : 'all'),
    [loading, setLoading] = useState(true);
  const [productModal, setProductModal] = useState(false),
    [editingId, setEditingId] = useState(null),
    [moveModal, setMoveModal] = useState(false);
  const [product, setProduct] = useState(blankProduct),
    [move, setMove] = useState(blankMove),
    [suppliers, setSuppliers] = useState([]),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(null);
  const [productErrors, setProductErrors] = useState({}),
    [moveErrors, setMoveErrors] = useState({}),
    [formError, setFormError] = useState(''),
    [selectedPart, setSelectedPart] = useState(null);
  const requestNumber = useRef(0);
  const savingRef = useRef(false);
  const pageSize = 25;
  const [category, setCategory] = useState('all'),
    [scan, setScan] = useState(false),
    [aliasText, setAliasText] = useState(''),
    [photoPaths, setPhotoPaths] = useState([]);
  async function scanned(code) {
    setScan(false);
    try {
      const r = await api.get(`/api/barcode/${encodeURIComponent(code)}`);
      if (productModal) {
        updateProduct('barcode', code);
      } else if (r.product) {
        setQ(code);
        setPage(1);
      } else if (!offline) {
        openAdd();
        setProduct(p => ({
          ...p,
          barcode: code
        }));
        setFormError('New barcode. Enter this part’s name and details before saving.');
      } else setToast({
        type: 'error',
        message: 'This barcode is not saved. Connect to add a new part.'
      });
    } catch (e) {
      setToast({
        type: 'error',
        message: e.message
      });
    }
  }
  const load = async () => {
    const request = ++requestNumber.current;
    setLoading(true);
    try {
      const result = await api.get(`/api/products?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&status=${status}&category=${category}`);
      if (request === requestNumber.current) {
        setRows(result.data);
        setCount(result.count || 0);
      }
    } catch (error) {
      if (request === requestNumber.current) setToast({
        type: 'error',
        message: error.message
      });
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  };
  useEffect(() => {
    const changed = () => {
      setOffline(!navigator.onLine);
      load();
    };
    const reachable = event => setOffline(!navigator.onLine || !event.detail);
    window.addEventListener('partcast:connection', reachable);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    window.addEventListener('partcast:queue', changed);
    return () => {
      window.removeEventListener('partcast:connection', reachable);
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
      window.removeEventListener('partcast:queue', changed);
    };
  }, [page, q, status, category]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [page, q, status, category]);
  useEffect(() => {
    api.get('/api/suppliers').then(result => setSuppliers(result.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    setQ(params.get('q') || '');
    setStatus(stockFilters.some(filter => filter.value === params.get('status')) ? params.get('status') : 'all');
    setPage(1);
  }, [params]);
  useEffect(() => {
    const code = params.get('newBarcode');
    if (code && barcodeValid(code)) {
      openAdd();
      setProduct(p => ({
        ...p,
        barcode: code
      }));
    }
  }, [params]);
  const selected = useMemo(() => rows.find(row => row.id === move.product_id) || selectedPart, [rows, move.product_id, selectedPart]);
  const quantity = Number(move.quantity);
  const quantityValid = move.quantity !== '' && validStockNumber(move.quantity) && quantity >= 0.01;
  const stockAfter = selected && quantityValid ? Math.round((Number(selected.current_stock) + (move.tx_type === 'stock_in' ? quantity : -quantity)) * 100) / 100 : null;
  const insufficientStock = stockAfter !== null && stockAfter < 0;
  const fieldProps = (name, errors, hint) => ({
    id: name,
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] || hint ? `${name}-message` : undefined
  });
  function openAdd() {
    setEditingId(null);
    setProduct({
      ...blankProduct
    });
    setAliasText('');
    setPhotoPaths([]);
    setProductErrors({});
    setFormError('');
    setProductModal(true);
  }
  function openEdit(row) {
    setEditingId(row.id);
    setAliasText((row.search_aliases || []).join(', '));
    setPhotoPaths(row.photo_paths || []);
    setProduct({
      category: row.category || 'parts',
      barcode: row.barcode || '',
      search_aliases: row.search_aliases || [],
      part_number: row.part_number || '',
      sub_number: row.sub_number || '',
      description: row.description || '',
      brand: row.brand || '',
      unit: row.unit || 'pc',
      location: row.location || '',
      current_stock: Number(row.current_stock || 0),
      minimum_stock: Number(row.minimum_stock || 0),
      safety_stock: Number(row.safety_stock || 0),
      unit_cost: Number(row.unit_cost || 0),
      selling_price: Number(row.selling_price || 0)
    });
    setProductErrors({});
    setFormError('');
    setProductModal(true);
  }
  function openMove(row, type) {
    setSelectedPart(row);
    setMove({
      ...blankMove,
      product_id: row.id,
      tx_type: type,
      unit_cost: row.unit_cost || '',
      unit_price: row.selling_price || ''
    });
    setMoveErrors({});
    setFormError('');
    setMoveModal(true);
  }
  function showValidation(errors, setErrors) {
    setErrors(errors);
    setFormError('Please check the highlighted fields before saving.');
    requestAnimationFrame(() => {
      for (const name of Object.keys(errors)) {
        const disclosure = document.getElementById(name)?.closest('details');
        if (disclosure) disclosure.open = true;
      }
      document.getElementById(Object.keys(errors)[0])?.focus();
    });
  }
  function updateProduct(key, value) {
    setProduct(current => ({
      ...current,
      [key]: value
    }));
    setProductErrors(current => ({
      ...current,
      [key]: undefined
    }));
    setFormError('');
  }
  function updateMove(key, value) {
    setMove(current => ({
      ...current,
      [key]: value
    }));
    setMoveErrors(current => ({
      ...current,
      [key]: undefined
    }));
    setFormError('');
  }
  async function saveProduct(event) {
    event.preventDefault();
    if (savingRef.current) return;
    const errors = {};
    if (product.description.trim().length < 2) errors.description = 'Enter a part name with at least 2 characters.';else if (product.description.trim().length > 500) errors.description = 'Keep the part name within 500 characters.';
    const numberFields = ['minimum_stock', 'safety_stock', 'unit_cost', 'selling_price', ...(!editingId ? ['current_stock'] : [])];
    for (const key of numberFields) {
      const required = key === 'minimum_stock' || key === 'current_stock';
      if (required && product[key] === '' || !validStockNumber(product[key])) errors[key] = 'Enter 0 or a larger number, with up to 2 decimal places.';
    }
    if (product.barcode && !barcodeValid(product.barcode)) errors.barcode = 'Use a barcode with up to 80 letters or numbers.';
    const aliases = aliasText.split(',').map(a => a.trim()).filter(Boolean);
    if (aliases.length > 20 || aliases.some(a => a.length > 80)) errors.aliases = 'Use up to 20 names, each under 80 characters.';
    if (Object.keys(errors).length) {
      showValidation(errors, setProductErrors);
      return;
    }
    savingRef.current = true;
    setProductErrors({});
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        ...product,
        barcode: product.barcode.trim() || null,
        search_aliases: aliases,
        description: product.description.trim(),
        ...Object.fromEntries(numberFields.map(key => [key, Number(product[key])]))
      };
      if (editingId) {
        const {
          current_stock,
          ...patch
        } = payload;
        await api.patch(`/api/products/${editingId}`, patch);
        setToast({
          message: 'Part details saved. Available stock has not changed.'
        });
      } else {
        await api.post('/api/products', payload);
        setToast({
          message:t('{v0} added to your inventory.',{v0:payload.description})
        });
      }
      setProduct({
        ...blankProduct
      });
      setEditingId(null);
      setProductModal(false);
      load();
    } catch (error) {
      setFormError(error.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function saveMovement(event) {
    event.preventDefault();
    if (savingRef.current) return;
    const errors = {};
    if (!quantityValid) errors.quantity = 'Enter a quantity of at least 0.01, with up to 2 decimal places.';else if (insufficientStock) errors.quantity = t('Only {v0} {v1} are available. Enter a smaller quantity.',{v0:formatQuantity(selected.current_stock),v1:selected.unit||t('units')});
    for (const key of ['unit_cost', 'unit_price', 'total_amount']) if (move[key] !== '' && !validStockNumber(move[key])) errors[key] = 'Use 0 or a larger amount with up to 2 decimal places, or leave this blank.';
    if (Object.keys(errors).length) {
      showValidation(errors, setMoveErrors);
      return;
    }
    savingRef.current = true;
    setMoveErrors({});
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        ...move,
        quantity,
        supplier_id: move.supplier_id || null,
        unit_cost: move.unit_cost === '' ? null : Number(move.unit_cost),
        unit_price: move.unit_price === '' ? null : Number(move.unit_price),
        total_amount: move.total_amount === '' ? null : Number(move.total_amount)
      };
      const result = await api.post('/api/inventory/movement', payload);
      setMoveModal(false);
      const activity = move.tx_type === 'stock_in' ? 'received' : move.tx_type === 'sale' ? 'sold' : 'removed';
      setToast({
        message: result.queued ? 'Saved on this device. It will send automatically when your connection returns.' : t('{v0} {v1} {v2}. Stock updated.',{v0:formatQuantity(quantity),v1:selected?.unit||t('units'),v2:t(activity)})
      });
      load();
    } catch (error) {
      setFormError(error.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const partActions = row => <>
    <div className="grid grid-cols-2 gap-2">
      <button className={`${intent === 'stock_in' ? 'btn-primary' : 'btn-secondary'} px-3`} onClick={() => openMove(row, 'stock_in')}><ArrowDownToLine size={17} aria-hidden="true" />{t("Receive")}</button>
      <button className={`${intent === 'stock_in' ? 'btn-secondary' : 'btn-primary'} px-3`} onClick={() => openMove(row, 'sale')}><ShoppingCart size={17} aria-hidden="true" />{t("Sell")}</button>
    </div>
    <details className="mt-2 text-sm text-slate-600">
      <summary className="min-h-11 cursor-pointer rounded-lg px-2 py-3 font-medium hover:bg-slate-50">{t("Other actions")}</summary>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button className="btn-secondary px-2" disabled={offline} onClick={() => openEdit(row)}><Pencil size={15} aria-hidden="true" />{t("Edit details")}</button>
        <button className="btn-secondary px-2" onClick={() => openMove(row, 'stock_out')}><ArrowUpFromLine size={15} aria-hidden="true" />{t("Remove stock")}</button>
      </div>
    </details>
  </>;
  return <>
    <PageHeader title={t("Inventory")} subtitle={t("Find a part and keep its stock up to date.")} actions={<><Link className="btn-secondary" to="/counter">{t("Sell or receive several parts")}</Link><button className="btn-primary" disabled={offline} onClick={openAdd}><Plus size={18} aria-hidden="true" />{t("Add a new part")}</button></>} />

    <section aria-label={t("How to update stock")} className={`mb-6 rounded-2xl border p-4 sm:p-5 ${intent ? 'border-red-100 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${intent ? 'bg-white text-red-700' : 'bg-slate-100 text-slate-600'}`}>
          {intent === 'sale' ? <ShoppingCart size={20} aria-hidden="true" /> : intent === 'stock_in' ? <ArrowDownToLine size={20} aria-hidden="true" /> : <Info size={20} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{intent === 'sale' ? t('Record a sale') : intent === 'stock_in' ? t('Receive a delivery') : t('Update stock in 3 easy steps')}</h2>
          <ol className="mt-3 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {['Find the part below', intent === 'sale' ? 'Choose Sell' : intent === 'stock_in' ? 'Choose Receive' : 'Choose Receive or Sell', 'Enter quantity and confirm'].map((step, index) => <li key={step} className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700">{index + 1}</span>{t(step)}</li>)}
          </ol>
        </div>
      </div>
    </section>

    {offline && <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><Info size={19} className="mt-1 shrink-0" aria-hidden="true" /><p><strong>{t("You can still record stock changes.")}</strong>{t(" They are saved on this device and sent when your connection returns. Adding or editing part details needs a connection.")}</p></div>}

    <section className="panel overflow-hidden" aria-label={t("Your inventory")}>
      <div className="border-b border-slate-100 p-4 sm:p-6">
        <label htmlFor="inventory-search" className="mb-2 block text-base font-semibold text-slate-900">{t("Find a part")}</label>
        <div className="flex items-center gap-2"><div className="relative min-w-0 flex-1 max-w-2xl">
          <Search className="pointer-events-none absolute left-4 top-3.5 text-slate-400" size={20} aria-hidden="true" />
          <input id="inventory-search" className="input min-h-12 pl-12 pr-12" aria-label={t("Search inventory")} placeholder={t("Enter a part name, number, or brand")} value={q} onChange={event => {
              setQ(event.target.value);
              setPage(1);
            }} />
          {q && <button aria-label={t("Clear search")} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => {
              setQ('');
              setPage(1);
            }}><X size={18} /></button>}
        </div>
        <button className="btn-secondary" onClick={() => setScan(true)}><ScanLine size={18} />{t("Scan")}</button></div><label className="mt-4 block max-w-sm"><span className="label">{t("Category")}</span><select aria-label={t("Category")} className="input" value={category} onChange={e => {
            setCategory(e.target.value);
            setPage(1);
          }}>{categories.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("Filter by stock level")}>
          {stockFilters.map(filter => <button key={filter.value} aria-pressed={status === filter.value} className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition ${status === filter.value ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`} onClick={() => {
            setStatus(filter.value);
            setPage(1);
          }}>{t(filter.label)}</button>)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6"><p className="text-sm font-medium text-slate-600" aria-live="polite">{loading ? t('Finding parts…') : `${count.toLocaleString()} ${count === 1 ? 'part' : 'parts'}${q || status !== 'all' ? ' found' : ' in your inventory'}`}</p><span className="hidden text-xs text-slate-500 sm:block">{t("Receive adds stock \xB7 Sell reduces stock")}</span></div>

      {loading ? <Loading /> : rows.length === 0 ? <div>
        <EmptyState title={q || status !== 'all' ? t('No parts match your search') : t('Your inventory is ready for its first part')} text={q || status !== 'all' ? t('Try a different name or part number, or show all parts.') : t('Choose “Add a new part” to start keeping track of your stock.')} />
        {(q || status !== 'all') && <div className="mb-8 flex justify-center"><button className="btn-secondary" onClick={() => {
            setQ('');
            setStatus('all');
            setPage(1);
          }}>{t("Show all parts")}</button></div>}
      </div> : <>
        <div className="hidden overflow-x-auto xl:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50 text-slate-600"><tr><th scope="col" className="px-6 py-4 font-medium">{t("Part details")}</th><th scope="col" className="px-4 py-4 font-medium">{t("Available stock")}</th><th scope="col" className="px-4 py-4 font-medium">{t("Location")}</th><th scope="col" className="w-64 px-6 py-4 font-medium">{t("What would you like to do?")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id} className="align-top hover:bg-slate-50/60">
              <td className="px-6 py-5"><ProductThumbnail product={row} className="mb-3 h-16 w-16" /><p className="max-w-md text-base font-semibold text-slate-900">{row.description || t('Unnamed part')}</p><p className="mt-1 text-sm text-slate-500">{row.part_number || t('No part number')}{row.brand ? ` · ${row.brand}` : ''}</p>{row.pending > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800"><CheckCircle2 size={14} aria-hidden="true" />{row.pending} {row.pending === 1 ? t('change') : t('changes')}{t(" saved on this device")}</p>}</td>
              <td className="px-4 py-5"><p className="mb-2"><strong className="text-2xl font-bold text-slate-900">{formatQuantity(row.current_stock)}</strong><span className="ml-2 text-slate-500">{row.unit || t('units')}</span></p><StatusBadge status={row.stock_status} /><p className="mt-2 text-xs text-slate-500">{t("Low-stock alert at ")}{formatQuantity(row.minimum_stock)}</p></td>
              <td className="px-4 py-5 text-slate-600">{row.location || t('Not set')}</td>
              <td className="min-w-60 px-6 py-5">{partActions(row)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-6 xl:hidden">{rows.map(row => <article key={row.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><ProductThumbnail product={row} /><StatusBadge status={row.stock_status} /></div>
          <h3 className="mt-4 break-words text-base font-semibold leading-6 text-slate-900">{row.description || t('Unnamed part')}</h3>
          <p className="mt-1 break-words text-sm text-slate-500">{row.part_number || t('No part number')}{row.brand ? ` · ${row.brand}` : ''}</p>
          <p className="mt-4 text-sm text-slate-600"><strong className="mr-2 text-3xl font-bold tracking-tight text-slate-900">{formatQuantity(row.current_stock)}</strong>{row.unit || t('units')}{t(" available")}</p>
          <dl className="mt-4 space-y-1.5 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">{t("Location")}</dt><dd className="text-right font-medium text-slate-700">{row.location || t('Not set')}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">{t("Low-stock alert at")}</dt><dd className="font-medium text-slate-700">{formatQuantity(row.minimum_stock)}</dd></div></dl>
          {row.pending > 0 && <p className="mt-3 flex items-start gap-1.5 text-xs font-medium leading-5 text-amber-800"><CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{row.pending} {row.pending === 1 ? t('change') : t('changes')}{t(" saved on this device")}</p>}
          <div className="mt-auto pt-5">{partActions(row)}</div>
        </article>)}</div>
      </>}
      <Pagination page={page} pageSize={pageSize} count={count} onPage={setPage} />
    </section>

    <Modal open={productModal} onClose={() => {
      if (!saving) setProductModal(false);
    }} title={editingId ? t('Edit part details') : t('Add a new part')} description={editingId ? t('Update the name, location, and stock alert. To change quantity, use Receive or Sell.') : t('Start with the part name and quantity. You can add more details later.')} size="lg" footer={<><button className="btn-secondary" disabled={saving} onClick={() => setProductModal(false)}>{t("Cancel")}</button><button type="submit" form="inventory-product-form" className="btn-primary" disabled={saving}>{saving ? t('Saving…') : editingId ? t('Save changes') : t('Save part')}</button></>}>
      <form id="inventory-product-form" onSubmit={saveProduct} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{t(formError)}</p>}
        <Field name="description" label={t("Part name *")} errors={productErrors} hint={t("Use a name staff will recognize, such as Toyota brake pad.")}><input {...fieldProps('description', productErrors, true)} className="input" required minLength={2} maxLength={500} value={product.description} onChange={event => updateProduct('description', event.target.value)} /></Field>
        <div className="grid gap-5 sm:grid-cols-2"><label><span className="label">{t("Category")}</span><select aria-label={t("Category")} className="input" value={product.category} onChange={e => updateProduct('category', e.target.value)}>{categories.filter(([id]) => id !== 'all').map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}</select></label><Field name="barcode" label={t("Barcode")} errors={productErrors} hint={t("Use the code on the box, or scan it.")}><div className="flex gap-2"><input id="barcode" className="input" maxLength={80} value={product.barcode} onChange={e => updateProduct('barcode', e.target.value)} /><button type="button" className="btn-secondary" onClick={() => setScan(true)}><ScanLine size={18} /><span className="sr-only">{t("Scan")}</span></button></div></Field>
          <Field name="part_number" label={t("Part number")} hint={t("Use the number printed on the part or box.")}><input id="part_number" aria-describedby="part_number-message" className="input" maxLength={120} value={product.part_number} onChange={event => updateProduct('part_number', event.target.value)} /></Field>
          <Field name="location" label={t("Where is it stored?")} hint={t("For example, Shelf A or Drawer 3.")}><input id="location" aria-describedby="location-message" className="input" maxLength={80} value={product.location} onChange={event => updateProduct('location', event.target.value)} /></Field>
          {!editingId && <Field name="current_stock" label={t("Starting quantity *")} errors={productErrors} hint={t("Enter how many you have now. Use 0 if there is no stock yet.")}><input {...fieldProps('current_stock', productErrors, true)} className="input" type="number" inputMode="decimal" min="0" step="0.01" required value={product.current_stock} onChange={event => updateProduct('current_stock', event.target.value)} /></Field>}
          <Field name="minimum_stock" label={t("Alert me when stock reaches *")} errors={productErrors} hint={t("You will see a low-stock warning at this quantity.")}><input {...fieldProps('minimum_stock', productErrors, true)} className="input" type="number" inputMode="decimal" min="0" step="0.01" required value={product.minimum_stock} onChange={event => updateProduct('minimum_stock', event.target.value)} /></Field>
        </div>
        <details className="rounded-xl border border-slate-200 p-4">
          <summary className="min-h-7 cursor-pointer text-sm font-semibold text-slate-700">{t("More part details ")}<span className="font-normal text-slate-500">{t("(optional)")}</span></summary>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {[['Brand', 'brand', 120], ['Unit (pc, set, or box)', 'unit', 40], ['Other part number', 'sub_number', 120]].map(([label, key, maxLength]) => <Field key={key} name={key} label={t(label)}><input id={key} className="input" maxLength={maxLength} value={product[key]} onChange={event => updateProduct(key, event.target.value)} /></Field>)}
            {[['Reserve quantity', 'safety_stock'], ['Cost per unit', 'unit_cost'], ['Selling price per unit', 'selling_price']].map(([label, key]) => <Field key={key} name={key} label={t(label)} errors={productErrors} hint={key === 'safety_stock' ? t('Extra stock to keep as a buffer.') : undefined}><input {...fieldProps(key, productErrors, key === 'safety_stock')} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={product[key]} onChange={event => updateProduct(key, event.target.value)} /></Field>)}
          </div>
        </details>
        <Field name="aliases" label={t("Other names for this part")} errors={productErrors} hint={t("Separate names with commas. For example: engine oil, langis ng makina.")}><input id="aliases" className="input" maxLength={1600} value={aliasText} onChange={e => setAliasText(e.target.value)} /></Field>
        {editingId ? <ProductPhotos productId={editingId} paths={photoPaths} onChange={paths => {
          setPhotoPaths(paths);
          load();
        }} /> : <p className="text-sm text-slate-500">{t("Save this part first, then choose Edit details to add its photos.")}</p>}
        <p className="text-xs text-slate-500">{t("* Required information")}</p>
      </form>
    </Modal>

    <Modal open={moveModal} onClose={() => {
      if (!saving) setMoveModal(false);
    }} title={move.tx_type === 'sale' ? t('Record a sale') : move.tx_type === 'stock_in' ? t('Receive stock') : t('Remove stock')} description={move.tx_type === 'stock_in' ? t('Add parts received in a delivery.') : move.tx_type === 'sale' ? t('Enter how many parts the customer bought.') : t('Use this for damaged, lost, or returned stock.')} size="md" footer={<><button className="btn-secondary" disabled={saving} onClick={() => setMoveModal(false)}>{t("Cancel")}</button><button type="submit" form="inventory-movement-form" className="btn-primary" disabled={saving}>{saving ? t('Saving…') : t('Confirm stock change')}</button></>}>
      <form id="inventory-movement-form" onSubmit={saveMovement} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{t(formError)}</p>}
        {selected && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-semibold text-slate-900">{t(selected.description)}</p><p className="mt-1 text-sm text-slate-500">{selected.part_number || t('No part number')}{selected.location ? ` · ${selected.location}` : ''}</p></div>}
        <Field name="quantity" label={t("Quantity *")} errors={moveErrors} hint={move.tx_type === 'stock_in' ? t('How many arrived in this delivery?') : move.tx_type === 'sale' ? t('How many are you selling?') : t('How many are you taking out of stock?')}><input {...fieldProps('quantity', moveErrors, true)} className="input min-h-14 text-xl font-semibold" type="number" inputMode="decimal" min="0.01" step="0.01" required value={move.quantity} onChange={event => updateMove('quantity', event.target.value)} /></Field>
        {selected && <div className={`rounded-xl border p-4 ${insufficientStock ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`} aria-live="polite">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-600">{t("Available now:")}<strong className="mt-1 block text-xl text-slate-900">{formatQuantity(selected.current_stock)} {selected.unit || t('units')}</strong></p><ArrowRight className="shrink-0 text-slate-400" size={22} aria-hidden="true" /><p className="text-right text-sm text-slate-600">{t("After this change:")}<strong className={`mt-1 block text-xl ${insufficientStock ? 'text-red-700' : 'text-emerald-800'}`}>{stockAfter === null ? t('Enter a quantity') : `${formatQuantity(stockAfter)} ${selected.unit || 'units'}`}</strong></p></div>
          {insufficientStock && <p className="mt-3 text-sm font-medium text-red-800">{t("There is not enough stock. Enter a smaller quantity.")}</p>}
          {offline && <p className="mt-3 border-t border-emerald-200 pt-3 text-sm leading-5 text-slate-700">{t("Saved on this device first. It will send automatically when you reconnect.")}</p>}
        </div>}
        <details className="rounded-xl border border-slate-200 p-4">
          <summary className="min-h-7 cursor-pointer text-sm font-semibold text-slate-700">{t("Add a receipt, price, or note ")}<span className="font-normal text-slate-500">{t("(optional)")}</span></summary>
          <div className="mt-5 space-y-5">
            {move.tx_type === 'stock_in' && <>
              <Field name="supplier_id" label={t("Supplier")}><select id="supplier_id" className="input" value={move.supplier_id} onChange={event => updateMove('supplier_id', event.target.value)}><option value="">{t("No supplier selected")}</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
              <Field name="unit_cost" label={t("Cost per unit")} errors={moveErrors}><input {...fieldProps('unit_cost', moveErrors)} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={move.unit_cost} onChange={event => updateMove('unit_cost', event.target.value)} /></Field>
            </>}
            {move.tx_type === 'sale' && <>
              <Field name="customer_name" label={t("Customer name")}><input id="customer_name" className="input" maxLength={240} value={move.customer_name} onChange={event => updateMove('customer_name', event.target.value)} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="unit_price" label={t("Price per unit")} errors={moveErrors}><input {...fieldProps('unit_price', moveErrors)} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={move.unit_price} onChange={event => updateMove('unit_price', event.target.value)} /></Field>
                <Field name="total_amount" label={t("Receipt total")} errors={moveErrors} hint={t("Leave blank to use quantity × price.")}><input {...fieldProps('total_amount', moveErrors, true)} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={move.total_amount} onChange={event => updateMove('total_amount', event.target.value)} /></Field>
              </div>
            </>}
            <Field name="reference_no" label={t("Invoice or receipt number")}><input id="reference_no" className="input" maxLength={180} value={move.reference_no} onChange={event => updateMove('reference_no', event.target.value)} /></Field>
            <Field name="notes" label={t("Note")}><textarea id="notes" className="input min-h-24" maxLength={1000} placeholder={t("Anything staff should know about this change")} value={move.notes} onChange={event => updateMove('notes', event.target.value)} /></Field>
          </div>
        </details>
        <p className="text-xs text-slate-500">{t("Stock changes only after you choose Confirm stock change.")}</p>
      </form>
    </Modal>
    <BarcodeScanner open={scan} onClose={() => setScan(false)} onScan={scanned} />
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
