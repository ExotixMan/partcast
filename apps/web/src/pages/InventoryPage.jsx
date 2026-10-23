import Form from '../components/Form.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, ChevronDown, Info, Lock, PackageX, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
import {staffRoles} from '../lib/access.js';
import { api } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import Loading from '../components/Loading.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ScanLine } from 'lucide-react';
import { categories, barcodeValid, validAmount, validQuantity, money } from '../lib/store.js';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import ProductPhotos, { ProductThumbnail } from '../components/ProductPhotos.jsx';
import PartCatalogLink from '../components/PartCatalogLink.jsx';
import Toast from '../components/Toast.jsx';
import './inventory.css';
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
  label: 'All parts',
  icon: Boxes
}, {
  value: 'low',
  label: 'Running low',
  icon: AlertTriangle
}, {
  value: 'out',
  label: 'Out of stock',
  icon: PackageX
}];
const formatQuantity = value => Number(value || 0).toLocaleString();
const validStockNumber = value => validQuantity(value);
const validPrice = value => validAmount(value);
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
  const navigate = useNavigate();
  const location = useLocation();
  const {profile} = useAuth();
  const canEdit = staffRoles.includes(profile?.role);
  const action = params.get('action');
  useEffect(() => { if (['sale','stock_in'].includes(action)) navigate(`/counter?mode=${action}`,{replace:true}); },[action,navigate]);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [rows, setRows] = useState([]),
    [count, setCount] = useState(0),
    [page, setPage] = useState(1),
    [q, setQ] = useState(() => params.get('q') || ''),
    [status, setStatus] = useState(() => stockFilters.some(filter => filter.value === params.get('status')) ? params.get('status') : 'all'),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
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
    [photoPaths, setPhotoPaths] = useState([]),
    [extraDetailsOpen, setExtraDetailsOpen] = useState(false),
    [confirmRemoval, setConfirmRemoval] = useState(false);
  async function scanned(code) {
    setScan(false);
    try {
      const r = await api.get(`/api/barcode/${encodeURIComponent(code)}`);
      if (productModal) {
        if (r.product && r.product.id !== editingId) {
          setProductErrors(current => ({...current, barcode: 'This barcode already belongs to another part. Use a different code.'}));
          setFormError('Please check the highlighted fields before saving.');
          setExtraDetailsOpen(true);
          return;
        }
        updateProduct('barcode', code);
      } else if (r.product) {
        setQ(code);
        setPage(1);
      } else if (!offline && canEdit) {
        openAdd();
        setProduct(p => ({
          ...p,
          barcode: code
        }));
        setExtraDetailsOpen(true);
        setFormError('New barcode. Enter this part’s name and details before saving.');
      } else setToast({
        type: 'error',
        message: canEdit ? 'This barcode is not saved. Connect to add a new part.' : 'Ask the owner to add this part to Inventory first.'
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
    setLoadError('');
    try {
      const result = await api.get(`/api/products?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&status=${status}&category=${category}`);
      if (!Array.isArray(result.data) || !Number.isFinite(result.count)) throw new Error('The store returned incomplete information. Please try again.');
      if (request === requestNumber.current) {
        setRows(result.data);
        setCount(result.count || 0);
      }
    } catch (error) {
      if (request === requestNumber.current) setLoadError(error.message);
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
    if (params.has('q')) setCategory('all');
    setPage(1);
  }, [params, location.key]);
  useEffect(() => {
    const code = params.get('newBarcode');
    if (canEdit && code && barcodeValid(code)) {
      openAdd();
      setProduct(p => ({
        ...p,
        barcode: code
      }));
      setExtraDetailsOpen(true);
    }
  }, [params]);
  const selected = useMemo(() => rows.find(row => row.id === move.product_id) || selectedPart, [rows, move.product_id, selectedPart]);
  const quantity = Number(move.quantity);
  const quantityValid = validStockNumber(move.quantity) && quantity >= 1;
  const stockAfter = selected && quantityValid ? Number(selected.current_stock) + (move.tx_type === 'stock_in' ? quantity : -quantity) : null;
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
    setExtraDetailsOpen(false);
    setConfirmRemoval(false);
    setProductErrors({});
    setFormError('');
    setProductModal(true);
  }
  function openEdit(row) {
    setEditingId(row.id);
    setAliasText((row.search_aliases || []).join(', '));
    setPhotoPaths(row.photo_paths || []);
    setExtraDetailsOpen(false);
    setConfirmRemoval(false);
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
      if (['unit_cost','selling_price'].includes(key)) {
        if (!validPrice(product[key])) errors[key] = 'Enter 0 or a larger number, with up to 2 decimal places.';
      } else if (!validStockNumber(product[key])) errors[key] = 'Enter a whole number of 0 or more. Do not use decimals.';
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
    if (!quantityValid) errors.quantity = 'Enter a whole number of 1 or more. Do not use decimals.';else if (insufficientStock) errors.quantity = t('Only {v0} {v1} are available. Enter a smaller quantity.',{v0:formatQuantity(selected.current_stock),v1:selected.unit||t('units')});
    if (move.notes.trim().length < 2) errors.notes = 'Enter a reason for this stock correction.';
    if (Object.keys(errors).length) {
      showValidation(errors, setMoveErrors);
      return;
    }
    savingRef.current = true;
    setMoveErrors({});
    setFormError('');
    setSaving(true);
    try {
      const payload = {product_id:move.product_id,tx_type:move.tx_type,quantity,notes:move.notes.trim()};
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
  async function removePart() {
    if (savingRef.current || !editingId || !confirmRemoval || offline) return;
    savingRef.current = true;
    setSaving(true);
    setFormError('');
    try {
      await api.patch(`/api/products/${editingId}`, {active: false});
      setProductModal(false);
      setConfirmRemoval(false);
      setToast({message: 'Part removed from active inventory. Past transactions are kept.'});
      load();
    } catch (error) {
      setFormError(error.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const filtered = Boolean(q || status !== 'all' || category !== 'all');
  const clearFilters = () => {
    setQ('');
    setStatus('all');
    setCategory('all');
    setPage(1);
  };
  const partActions = row => canEdit ? <div className="inventory-part-actions">
    <button type="button" className="btn-secondary inventory-edit-action" disabled={offline} onClick={() => openEdit(row)}><Pencil size={17} aria-hidden="true" />{t('Edit details')}</button>
    <button type="button" className="inventory-adjust-action" onClick={() => openMove(row,'stock_out')}><SlidersHorizontal size={17} aria-hidden="true" />{t('Adjust stock')}</button>
  </div> : <span className="inventory-read-only"><Lock size={15} aria-hidden="true" />{t('View only')}</span>;
  const partDetails = row => <details className="inventory-part-details group">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-600">{t('Part details')}<ChevronDown size={16} className="shrink-0 group-open:rotate-180" aria-hidden="true" /></summary>
    <dl className="inventory-detail-grid">
      {[[t('Location'),row.location || t('Not set')],[t('Brand'),row.brand || t('Not set')],[t('Category'),t(categories.find(([key]) => key === row.category)?.[1] || 'Car parts')],[t('Barcode'),row.barcode || t('Not set')],[t('Low-stock alert at'),formatQuantity(row.minimum_stock)],[t('Reserve quantity'),formatQuantity(row.safety_stock)]].map(([label,value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words font-medium text-slate-700">{value}</dd></div>)}
      {!!row.search_aliases?.length && <div className="inventory-detail-aliases"><dt className="text-slate-500">{t('Other names for this part')}</dt><dd className="break-words text-slate-700">{row.search_aliases.join(', ')}</dd></div>}
    </dl>
  </details>;
  return <div className="inventory-page">
    <PageHeader title={t('Inventory')} actions={canEdit && <button type="button" className="btn-primary" disabled={offline} onClick={openAdd}><Plus size={18} aria-hidden="true" />{t('Add a new part')}</button>} />

    {offline && <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><Info size={19} className="mt-1 shrink-0" aria-hidden="true" /><p><strong>{t('You can still record stock changes.')}</strong>{t(' They are saved on this device and sent when your connection returns. Adding or editing part details needs a connection.')}</p></div>}

    <section className="inventory-browser" aria-label={t('Your inventory')} aria-busy={loading}>
      <div className="inventory-toolbar panel">
        <label htmlFor="inventory-search" className="label">{t('Search inventory')}</label>
        <div className="inventory-search-row"><div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-3.5 text-slate-500" size={20} aria-hidden="true" />
          <input id="inventory-search" className="input min-h-12 pl-12 pr-12" aria-label={t('Search inventory')} type="text" placeholder={t('Name, part number, or barcode')} value={q} onChange={event => {
              setQ(event.target.value);
              setPage(1);
            }} />
          {q && <button type="button" aria-label={t('Clear search')} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => {
              setQ('');
              setPage(1);
            }}><X size={18} aria-hidden="true" /></button>}
        </div><button type="button" className="btn-secondary shrink-0" onClick={() => setScan(true)}><ScanLine size={20} aria-hidden="true" />{t('Scan')}</button></div>
        <div className="inventory-filter-row">
          <div className="inventory-stock-filters" role="group" aria-label={t('Filter by stock level')}>
            {stockFilters.map(({value,label,icon:Icon}) => <button type="button" key={value} aria-pressed={status === value} className={status === value ? 'is-selected' : ''} onClick={() => {
              setStatus(value);
              setPage(1);
            }}><Icon size={18} aria-hidden="true" /><span>{t(label)}</span></button>)}
          </div>
          <label className="inventory-category"><span className="label">{t('Category')}</span><select aria-label={t('Category')} className="input" value={category} onChange={event => {
            setCategory(event.target.value);
            setPage(1);
          }}>{categories.map(([id,label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
        </div>
      </div>
      <div className="inventory-results-heading"><p className="text-sm font-medium text-slate-600" aria-live="polite">{loading ? t('Finding parts…') : loadError && !rows.length ? '—' : count === 1 ? t('1 part found') : t('{v0} parts found',{v0:count.toLocaleString()})}</p>{filtered && <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-red-700" onClick={clearFilters}><X size={16} aria-hidden="true" />{t('Clear filters')}</button>}</div>
      {loadError && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="min-w-0 break-words">{t(loadError)}</p><button type="button" className="btn-secondary" disabled={loading} onClick={load}>{t('Try again')}</button></div>}

      {loading ? <Loading /> : rows.length === 0 ? !loadError && <div className="panel">
        <EmptyState title={t('No parts found')} text="" />
        {filtered && <div className="mb-6 flex justify-center"><button type="button" className="btn-secondary" onClick={clearFilters}>{t('Show all parts')}</button></div>}
      </div> : <div className="inventory-results">{rows.map(row => <article key={row.id} className="inventory-part-card">
        <div className="inventory-part-main">
          <div className="inventory-part-identity"><ProductThumbnail product={row} className="inventory-part-photo" showLabel={false} fullscreen /><div className="min-w-0 flex-1"><h3 className="break-words text-base font-bold leading-snug text-slate-900">{row.description || t('Unnamed part')}</h3><p className="inventory-part-number">{row.part_number || t('No part number')}</p><StatusBadge status={row.stock_status} /></div></div>
          <dl className="inventory-part-stats"><div><dt>{t('Available stock')}</dt><dd><strong className="inventory-stock-value">{formatQuantity(row.current_stock)}</strong><span className="inventory-stock-unit">{row.unit || t('units')}</span></dd></div><div><dt>{t('Selling price per unit')}</dt><dd className="inventory-price-value">{money(row.selling_price)}</dd></div></dl>
          {partActions(row)}
        </div>
        {row.pending > 0 && <p className="mt-3 flex items-start gap-1.5 text-xs font-medium leading-5 text-amber-800"><CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{row.pending} {row.pending === 1 ? t('change') : t('changes')}{t(' saved on this device')}</p>}
        {partDetails(row)}
      </article>)}</div>}
      {(!loadError || rows.length > 0) && <div className="panel mt-4 overflow-hidden"><Pagination page={page} pageSize={pageSize} count={count} onPage={setPage} /></div>}
    </section>

    <Modal open={productModal} onClose={() => {
      if (!saving) setProductModal(false);
    }} title={editingId ? t('Edit part details') : t('Add a new part')} size="lg" footer={<><button className="btn-secondary" disabled={saving} onClick={() => setProductModal(false)}>{t("Cancel")}</button><button type="submit" form="inventory-product-form" className="btn-primary" disabled={saving}>{saving ? t('Saving…') : editingId ? t('Save changes') : t('Save part')}</button></>}>
      <Form id="inventory-product-form" onSubmit={saveProduct} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{t(formError)}</p>}
        <Field name="description" label={t("Part name *")} errors={productErrors} hint={t("Use a name staff will recognize, such as Toyota brake pad.")}><input {...fieldProps('description', productErrors, true)} className="input" required minLength={2} maxLength={500} value={product.description} onChange={event => updateProduct('description', event.target.value)} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <label><span className="label">{t("Category")}</span><select aria-label={t("Category")} className="input" value={product.category} onChange={e => updateProduct('category', e.target.value)}>{categories.filter(([id]) => id !== 'all').map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}</select></label>
          <Field name="selling_price" label={t("Selling price per unit")} errors={productErrors}><input {...fieldProps('selling_price',productErrors)} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={product.selling_price} onChange={event => updateProduct('selling_price',event.target.value)} /></Field>
          {!editingId && <Field name="current_stock" label={t("Starting quantity *")} errors={productErrors} hint={t("Enter how many you have now. Use 0 if there is no stock yet.")}><input {...fieldProps('current_stock', productErrors, true)} className="input" type="number" inputMode="numeric" min="0" max="999999999999" step="1" required value={product.current_stock} onChange={event => updateProduct('current_stock', event.target.value)} /></Field>}
        </div>
        <details className="group rounded-xl border border-slate-200 p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-slate-700">{t('Stock alerts')}<ChevronDown size={18} className="shrink-0 group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field name="minimum_stock" label={t("Alert me when stock reaches *")} errors={productErrors} hint={t("You will see a low-stock warning at this quantity.")}><input {...fieldProps('minimum_stock', productErrors, true)} className="input" type="number" inputMode="numeric" min="0" max="999999999999" step="1" required value={product.minimum_stock} onChange={event => updateProduct('minimum_stock', event.target.value)} /></Field>
            <Field name="safety_stock" label={t("Reserve quantity")} errors={productErrors} hint={t('Extra stock to keep as a buffer.')}><input {...fieldProps('safety_stock',productErrors,true)} className="input" type="number" inputMode="numeric" min="0" max="999999999999" step="1" value={product.safety_stock} onChange={event => updateProduct('safety_stock',event.target.value)} /></Field>
          </div>
        </details>
        <details className="group rounded-xl border border-slate-200 p-4" open={extraDetailsOpen} onToggle={event => setExtraDetailsOpen(event.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-slate-700"><span>{t("More part details ")}<span className="font-normal text-slate-500">{t("(optional)")}</span></span><ChevronDown size={18} className="shrink-0 group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field name="barcode" label={t("Barcode")} errors={productErrors} hint={t("Use the printed code for this part. Each barcode can belong to only one part.")}><div className="flex gap-2"><input {...fieldProps('barcode',productErrors,true)} className="input" maxLength={80} value={product.barcode} onChange={e => updateProduct('barcode', e.target.value)} /><button type="button" className="btn-secondary" onClick={() => setScan(true)}><ScanLine size={18} /><span className="sr-only">{t("Scan")}</span></button></div></Field>
            <Field name="part_number" label={t("Part number")} hint={t("Use the number printed on the part or box.")}><input id="part_number" aria-describedby="part_number-message" className="input" maxLength={120} value={product.part_number} onChange={event => updateProduct('part_number', event.target.value)} /><PartCatalogLink partNumber={product.part_number}/></Field>
            <Field name="location" label={t("Where is it stored?")} hint={t("For example, Shelf A or Drawer 3.")}><input id="location" aria-describedby="location-message" className="input" maxLength={80} value={product.location} onChange={event => updateProduct('location', event.target.value)} /></Field>
            {[['Brand', 'brand', 120], ['Unit (pc, set, or box)', 'unit', 40], ['Other part number', 'sub_number', 120]].map(([label, key, maxLength]) => <Field key={key} name={key} label={t(label)}><input id={key} className="input" maxLength={maxLength} value={product[key]} onChange={event => updateProduct(key, event.target.value)} /></Field>)}
            <Field name="unit_cost" label={t('Cost per unit')} errors={productErrors}><input {...fieldProps('unit_cost',productErrors)} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={product.unit_cost} onChange={event => updateProduct('unit_cost',event.target.value)} /></Field>
            <Field name="aliases" className="sm:col-span-2" label={t("Other names for this part")} errors={productErrors} hint={t("Separate names with commas. For example: engine oil, langis ng makina.")}><input {...fieldProps('aliases',productErrors,true)} className="input" maxLength={1600} value={aliasText} onChange={e => setAliasText(e.target.value)} /></Field>
          </div>
        </details>
        {editingId ? <ProductPhotos productId={editingId} paths={photoPaths} onChange={paths => {
          setPhotoPaths(paths);
          load();
        }} /> : <p className="text-sm text-slate-500">{t("Save this part first, then choose Edit details to add its photos.")}</p>}
        {editingId && <details className="rounded-xl border border-slate-200 p-4" onToggle={event => {if (!event.currentTarget.open) setConfirmRemoval(false);}}>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600"><Trash2 size={17} aria-hidden="true" />{t('Remove from active inventory')}</summary>
          <p className="mt-3 text-sm text-slate-600">{t('This part will no longer appear in inventory or selling choices. Past transactions and photos are kept.')}</p>
          {confirmRemoval ? <div role="group" aria-label={t('Confirm removal')} className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="font-semibold text-red-800">{t('Remove this part from active inventory?')}</p><p className="mt-1 text-sm text-red-800">{t('Unsaved edits in this form will not be saved.')}</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setConfirmRemoval(false)}>{t('Keep this part')}</button><button type="button" className="btn-danger" disabled={saving || offline} onClick={removePart}>{saving?t('Saving…'):t('Confirm removal')}</button></div>
          </div> : <button type="button" className="btn-danger mt-3" disabled={saving || offline} onClick={() => setConfirmRemoval(true)}><Trash2 size={17} />{t('Remove from active inventory')}</button>}
        </details>}
        <p className="text-xs text-slate-500">{t("* Required information")}</p>
      </Form>
    </Modal>

    <Modal open={moveModal} onClose={() => {if(!saving)setMoveModal(false);}} title={t("Adjust stock count")} description={t("Use this for damaged, missing, or counted stock. Record sales and deliveries in Sell or receive.")} footer={<><button className="btn-secondary" disabled={saving} onClick={()=>setMoveModal(false)}>{t("Cancel")}</button><button type="submit" form="inventory-adjust-form" className="btn-primary" disabled={saving}>{saving?t('Saving…'):t('Confirm correction')}</button></>}>
      <Form id="inventory-adjust-form" onSubmit={saveMovement} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{t(formError)}</p>}
        <h3 className="font-bold">{selected?.description}</h3>
        <label className="block"><span className="label">{t("What needs correcting?")}</span><select className="input" value={move.tx_type} onChange={e=>updateMove('tx_type',e.target.value)}><option value="stock_out">{t("Remove stock")}</option><option value="stock_in">{t("Add stock")}</option></select></label>
        <Field name="quantity" label={t("Quantity *")} errors={moveErrors}><input {...fieldProps('quantity',moveErrors)} className="input" type="number" inputMode="numeric" min="1" max="999999999999" step="1" required value={move.quantity} onChange={e=>updateMove('quantity',e.target.value)} /></Field>
        <Field name="notes" label={t("Reason for correction *")} errors={moveErrors} hint={t("For example, damaged part or shelf count corrected.")}><textarea {...fieldProps('notes',moveErrors,true)} className="input" minLength={2} maxLength={1000} required value={move.notes} onChange={e=>updateMove('notes',e.target.value)} /></Field>
        <div className={`rounded-xl p-4 ${insufficientStock?'bg-red-50 text-red-800':'bg-slate-50 text-slate-700'}`}><p>{t("Available now: {v0}",{v0:formatQuantity(selected?.current_stock)})}</p><p className="mt-1 font-bold">{t("After correction: {v0}",{v0:stockAfter===null?'—':formatQuantity(stockAfter)})}</p></div>
      </Form>
    </Modal>
    <BarcodeScanner open={scan} onClose={() => setScan(false)} onScan={scanned} />
    <Toast toast={toast} onClose={() => setToast(null)} />
  </div>;
}
