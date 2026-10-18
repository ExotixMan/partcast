import Form from '../components/Form.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useMemo, useState, useRef } from 'react';
import { ArrowRight, CheckCircle2, Mail, Package, Plus, RefreshCw, Search, Send, SlidersHorizontal, Truck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Loading from '../components/Loading.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { validAmount } from '../lib/store.js';
import {suggestedQuantity as suggested,suggestedCost} from '../lib/restock.js';
import Toast from '../components/Toast.jsx';
import HelpDetails from '../components/HelpDetails.jsx';
import SupplierPartPicker from '../components/SupplierPartPicker.jsx';
import {filterRestock,matchesSearch} from '../lib/restock.js';
const peso = value => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
}).format(Number(value || 0));
const units = value => Number(value || 0).toLocaleString(undefined, {
  maximumFractionDigits: 2
});
const blankSupplier = {
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  address: ''
};
export default function ReorderPage() {
  useLocale();
  const {
    profile
  } = useAuth();
  const admin = ['super_admin', 'owner', 'admin'].includes(profile?.role);
  const [tab, setTab] = useState('reorder');
  const [searchDraft,setSearchDraft]=useState(''),[query,setQuery]=useState(''),[stockFilter,setStockFilter]=useState('all'),[supplierFilter,setSupplierFilter]=useState('all');
  const [supplierSearchDraft,setSupplierSearchDraft]=useState(''),[supplierQuery,setSupplierQuery]=useState('');
  const [filtersOpen,setFiltersOpen]=useState(()=>window.matchMedia('(min-width: 768px)').matches);
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplier, setSupplier] = useState(blankSupplier);
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [supplierError,setSupplierError]=useState(''),[assignError,setAssignError]=useState('');
  const [assign, setAssign] = useState(null);
  const [assignSupplier, setAssignSupplier] = useState('');
  const [unitCost, setUnitCost] = useState(0);
  const [leadTime, setLeadTime] = useState(7);
  const [emailGroup, setEmailGroup] = useState(null);
  const [emailChoices,setEmailChoices]=useState([]),[choicesLoading,setChoicesLoading]=useState(false),[choicesError,setChoicesError]=useState(''),[columnName,setColumnName]=useState('');
  const loadNumber=useRef(0),emailNumber=useRef(0);
  const [draft, setDraft] = useState({
      subject: '',
      message: '',
      items: [],extra_columns:[]
    }),
    [emailError, setEmailError] = useState('');
  async function reviewEmail(group) {
    if(group.items.length>100){setToast({type:'error',message:'Choose 100 parts or fewer using search and filters before reviewing an email.'});document.getElementById('restock-search')?.focus();return;}
    setEmailGroup(group);
    setEmailError('');
    setColumnName('');setEmailChoices(group.items);
    setDraft({
      subject: 'NPG Autoparts - Parts order request',
      message: 'Hello, please confirm availability, prices, and delivery time for the parts below. Thank you.',
      extra_columns:[],
      items: group.items.map(r => ({
        product_id: r.product_id,
        part_number: r.part_number || '',
        description: r.description,
        quantity: String(suggested(r)),unit:r.unit||'units',extra_values:{}
      }))
    });
    loadEmailChoices(group);
  }
  async function loadEmailChoices(group){
    const request=++emailNumber.current;
    setChoicesLoading(true);setChoicesError('');
    try{
      const result=await api.get(`/api/reorder?onlyNeeded=false&supplierId=${group.supplierId}`);
      if(!Array.isArray(result.data))throw new Error('The store returned incomplete information. Please try again.');
      if(request===emailNumber.current)setEmailChoices(current=>[...new Map([...current,...result.data].map(row=>[row.product_id,row])).values()]);
    }catch(error){if(request===emailNumber.current)setChoicesError(error.message);}
    finally{if(request===emailNumber.current)setChoicesLoading(false);}
  }
  function addColumn(){
    const label=columnName.trim();
    const reserved=['Part number','Description','In stock','Unit','Quantity'].flatMap(x=>[x.toLowerCase(),t(x).toLowerCase()]);
    if(!label||label.length>50||/[\r\n]/.test(label)||reserved.includes(label.toLowerCase())||draft.extra_columns.some(c=>c.label.toLowerCase()===label.toLowerCase())||draft.extra_columns.length>=5){setEmailError('Use a unique column name. You can add up to 5 columns.');return;}
    setDraft(d=>({...d,extra_columns:[...d.extra_columns,{id:crypto.randomUUID(),label}]}));setColumnName('');setEmailError('');
  }
  function removeColumn(id){setDraft(d=>({...d,extra_columns:d.extra_columns.filter(c=>c.id!==id),items:d.items.map(i=>({...i,extra_values:Object.fromEntries(Object.entries(i.extra_values||{}).filter(([key])=>key!==id))}))}));}
  function addPart(row){
    setEmailChoices(current=>[...new Map([...current,row].map(item=>[item.product_id,item])).values()]);
    setDraft(d=>d.items.some(item=>item.product_id===row.product_id)||d.items.length>=100?d:({...d,items:[...d.items,{product_id:row.product_id,part_number:row.part_number||'',description:row.description,unit:row.unit||'units',quantity:String(Math.max(1,suggested(row))),extra_values:{}}]}));
    setEmailError('');
  }
  function editItem(id, key, value) {
    setDraft(d => ({
      ...d,
      items: d.items.map(i => i.product_id === id ? {
        ...i,
        [key]: value
      } : i)
    }));
    setEmailError('');
  }
  async function load(quiet=false) {
    const request=++loadNumber.current;
    if(!quiet)setLoading(true);
    setLoadError('');
    try {
      const [r, s] = await Promise.all([api.get('/api/reorder?onlyNeeded=true'), api.get('/api/suppliers')]);
      if(request!==loadNumber.current)return;
      if(!Array.isArray(r.data)||!Array.isArray(s.data))throw new Error('The store returned incomplete information. Please try again.');
      setRows(r.data);
      setSuppliers(s.data);
    } catch (error) {
      if(request===loadNumber.current)setLoadError(error.message);
    } finally {
      if(request===loadNumber.current)setLoading(false);
    }
  }
  useEffect(() => {
    load();const refresh=()=>{if(navigator.onLine)load(true);};const timer=setInterval(refresh,60000);
    window.addEventListener('partcast:queue',refresh);window.addEventListener('online',refresh);window.addEventListener('focus',refresh);
    return()=>{loadNumber.current++;emailNumber.current++;clearInterval(timer);window.removeEventListener('partcast:queue',refresh);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);};
  }, []);
  const visibleRows=useMemo(()=>filterRestock(rows,{query,status:stockFilter,supplier:supplierFilter}),[rows,query,stockFilter,supplierFilter]);
  const visibleSuppliers=useMemo(()=>suppliers.filter(s=>matchesSearch([s.name,s.email,s.phone,s.contact_person],supplierQuery)),[suppliers,supplierQuery]);
  const filtered=query!==''||stockFilter!=='all'||supplierFilter!=='all';
  function clearFilters(){setSearchDraft('');setQuery('');setStockFilter('all');setSupplierFilter('all');}
  const groups = useMemo(() => {
    const result = new Map();
    for (const row of visibleRows) {
      const key = row.supplier_id || 'unassigned';
      if (!result.has(key)) result.set(key, {
        supplierId: row.supplier_id,
        name: row.supplier_name || 'No supplier',
        email: row.supplier_email,
        items: []
      });
      result.get(key).items.push(row);
    }
    return [...result.values()];
  }, [visibleRows]);
  const outOfStock = rows.filter(row => String(row.status).includes('out')).length;
  const unassigned = rows.filter(row => !row.supplier_id).length;
  function openSupplier(item = null) {
    if (busy) return;
    setEditingSupplierId(item?.id || '');
    setSupplierError('');
    setSupplier(item ? Object.fromEntries(Object.keys(blankSupplier).map(key => [key, item[key] || ''])) : blankSupplier);
    setSupplierModal(true);
  }
  async function createSupplier(event) {
    event.preventDefault();
    if (busy) return;
    if(supplier.name.trim().length<2){setSupplierError('Enter a supplier name with at least 2 characters.');return;}
    setSupplierError('');
    setBusy('supplier');
    try {
      const details = {
        ...supplier,
        name: supplier.name.trim(),
        email: supplier.email.trim() || null,
        contact_person: supplier.contact_person.trim() || null,
        phone: supplier.phone.trim() || null,
        address: supplier.address.trim() || null
      };
      if (editingSupplierId) await api.patch(`/api/suppliers/${editingSupplierId}`, details);else await api.post('/api/suppliers', details);
      setSupplier(blankSupplier);
      setSupplierModal(false);
      setToast({
        message: editingSupplierId ? 'Supplier contact details updated.' : 'Supplier saved. You can now choose them for a part.'
      });
      await load();
    } catch (error) {
      setSupplierError(error.message);
    } finally {
      setBusy('');
    }
  }
  function openAssign(row) {
    setAssignError('');
    setAssign(row);
    setAssignSupplier('');
    setUnitCost(row.estimated_unit_cost || 0);
    setLeadTime(7);
  }
  async function saveAssign(event) {
    event.preventDefault();
    if (busy) return;
    if(!assignSupplier){setAssignError('Choose a supplier before saving.');return;}
    if(!validAmount(unitCost)||!/^\d+$/.test(String(leadTime))||Number(leadTime)>365){setAssignError('Enter a valid cost and a whole delivery time from 0 to 365 days.');return;}
    setAssignError('');
    setBusy('assign');
    try {
      await api.post(`/api/products/${assign.product_id}/suppliers/${assignSupplier}`, {
        latest_unit_cost: Number(unitCost || 0),
        lead_time_days: Number(leadTime),
        is_primary: true
      });
      setAssign(null);
      setToast({
        message: 'Supplier saved for this part.'
      });
      await load();
    } catch (error) {
      setAssignError(error.message);
    } finally {
      setBusy('');
    }
  }
  async function send(group) {
    if (busy || !group?.supplierId) return;
    if (!document.getElementById('supplier-email-form')?.reportValidity()) return;
    if (!draft.items.length || draft.items.some(i => !validAmount(i.quantity, true) || i.description.trim().length < 2) || draft.subject.trim().length < 2 || draft.message.trim().length < 2) {
      setEmailError('Check your subject, message, part descriptions, and positive quantities.');
      return;
    }
    setEmailError('');
    setBusy(group.supplierId);
    try {
      const result = await api.post(`/api/admin/supplier-email/${group.supplierId}`, {
        ...draft,
        subject: draft.subject.trim(),
        message: draft.message.trim(),
        items: draft.items.map(i => ({
          ...i,
          quantity: Number(i.quantity)
        }))
      });
      setEmailGroup(null);
      setToast({
        message: t('Email sent to {v0} with {v1} parts to restock. Confirm availability and prices with your supplier.',{v0:group.name,v1:result.items})
      });
    } catch (error) {
      setEmailError(error.message);
    } finally {
      setBusy('');
    }
  }
  return <>
    <PageHeader title={t("Restock")} inlineActions={tab==='reorder'} actions={<><button className="btn-secondary px-3" aria-label={loading?t('Checking stock…'):t('Refresh list')} onClick={()=>load()} disabled={loading}><RefreshCw size={17} /><span className="hidden sm:inline">{loading ? t('Checking stock…') : t('Refresh list')}</span></button>{admin && tab==='suppliers' && <button className="btn-primary" onClick={() => openSupplier()}><Plus size={17} />{t("Add supplier")}</button>}</>} />


    <div className="mb-5 flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:w-fit" role="group" aria-label={t("Restock pages")}><button className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${tab === 'reorder' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('reorder')} aria-pressed={tab === 'reorder'} aria-label={t("Parts to restock")}><Package size={17} className="shrink-0" />{t("Parts")}</button><button className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${tab === 'suppliers' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('suppliers')} aria-pressed={tab === 'suppliers'}><Truck size={17} className="shrink-0" />{t("Suppliers")}</button></div>

    <section className="panel mb-4 p-3 sm:p-4" aria-label={t('Restock search and filters')}>
      <Form onSubmit={event=>{event.preventDefault();if(tab==='reorder')setQuery(searchDraft.trim());else setSupplierQuery(supplierSearchDraft.trim());}}>
        <label className="label" htmlFor="restock-search">{tab==='reorder'?t('Find a part'):t('Search suppliers')}</label>
        <div className="flex gap-2"><input id="restock-search" aria-label={tab==='reorder'?t('Search parts to restock'):t('Search suppliers')} type="search" className="input min-w-0 flex-1" maxLength={200} placeholder={tab==='reorder'?t('Part number or name'):t('Name, email or phone')} value={tab==='reorder'?searchDraft:supplierSearchDraft} onChange={event=>tab==='reorder'?setSearchDraft(event.target.value):setSupplierSearchDraft(event.target.value)}/><button className="btn-secondary shrink-0 px-3"><Search size={18} aria-hidden="true"/>{t('Search')}</button></div>
        {tab==='reorder'&&<div id="restock-filters" hidden={!filtersOpen} className={filtersOpen?'mt-3 grid grid-cols-2 items-end gap-3':'hidden'}>
          <label className="min-w-0"><span className="label">{t('Stock')}</span><select className="input min-w-0" aria-label={t("Stock status")} value={stockFilter} onChange={event=>setStockFilter(event.target.value)}><option value="all">{t('All')}</option><option value="out_of_stock">{t('Out of stock')} ({outOfStock})</option><option value="low_stock">{t('Low stock')}</option><option value="forecast_reorder">{t('Suggested by forecast')}</option></select></label>
          <label className="min-w-0"><span className="label">{t('Supplier')}</span><select className="input min-w-0" aria-label={t("Supplier")} value={supplierFilter} onChange={event=>setSupplierFilter(event.target.value)}><option value="all">{t('All')}</option><option value="unassigned">{t('No supplier')} ({unassigned})</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        </div>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {tab==='reorder'&&<button type="button" className="btn-secondary gap-1 px-3 py-2" aria-expanded={filtersOpen} aria-controls="restock-filters" onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={17} aria-hidden="true"/>{t('Filters')}{(stockFilter!=='all'||supplierFilter!=='all')&&<span className="ml-1 font-bold">({Number(stockFilter!=='all')+Number(supplierFilter!=='all')})</span>}</button>}
          {!loading&&!loadError&&<p className="text-sm text-slate-600" role="status">{tab==='reorder'?t('{v0} of {v1} parts',{v0:visibleRows.length,v1:rows.length}):t('{v0} of {v1} suppliers',{v0:visibleSuppliers.length,v1:suppliers.length})}</p>}
          {(tab==='reorder'?filtered||searchDraft: supplierQuery||supplierSearchDraft)&&<button type="button" className="min-h-11 text-sm font-semibold text-red-700 underline underline-offset-2" onClick={()=>{if(tab==='reorder')clearFilters();else{setSupplierQuery('');setSupplierSearchDraft('');}}}>{t('Clear filters')}</button>}
        </div>
      </Form>
    </section>

    {loading ? <Loading label={t("Checking parts and suppliers…")} /> : loadError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">{t("We could not load your restock list.")}</h2><p className="mt-2 text-sm text-amber-900">{t(loadError)}</p><button className="btn-secondary mt-4" onClick={()=>load()}>{t("Try again")}</button></div> : tab === 'reorder' ? <>
      {groups.length > 0 ? <div className="space-y-4">{groups.map(group => <section key={group.supplierId || 'unassigned'} className="panel overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0"><h2 className="break-words font-bold text-slate-950">{t(group.name)}</h2><p className="mt-1 text-sm text-slate-600">{group.items.length===1?t('1 part'):t('{v0} parts',{v0:group.items.length})}</p>{group.supplierId&&!group.email&&<p className="mt-1 text-sm text-amber-800">{t('Email needed')}</p>}{group.email&&<p className="mt-1 hidden break-all text-sm text-slate-600 sm:block">{group.email}</p>}</div>
          {admin&&group.supplierId&&(group.email?<button className="btn-primary shrink-0 px-3" aria-label={t('Review supplier email')} disabled={Boolean(busy)} onClick={()=>reviewEmail(group)}><Mail size={17} aria-hidden="true"/><span className="sm:hidden">{t('Review')}</span><span className="hidden sm:inline">{t('Review supplier email')}</span></button>:<button className="btn-secondary shrink-0 px-3" aria-label={t('Add email address')} disabled={!suppliers.some(item=>item.id===group.supplierId)} onClick={()=>openSupplier(suppliers.find(item=>item.id===group.supplierId))}><span className="sm:hidden">{t('Add email')}</span><span className="hidden sm:inline">{t('Add email address')}</span></button>)}
        </div>
        <div className="divide-y divide-slate-100 lg:hidden">{group.items.map(row => <article key={row.product_id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-red-700">{row.part_number || t('No part number')}</p><StatusBadge status={row.status} /></div><h3 className="mt-2 font-bold leading-6 text-slate-950">{t(row.description)}</h3><dl className="mt-4 grid grid-cols-2 gap-3"><div className="py-1"><dt className="text-sm text-slate-600">{t("In stock now")}</dt><dd className="mt-1 text-lg font-semibold">{units(row.current_stock)}{t(" units")}</dd></div><div className="py-1"><dt className="text-sm text-red-700">{t("Suggested this purchase")}</dt><dd className="mt-1 text-lg font-bold text-red-800">{suggested(row)}{t(" units")}</dd></div><div><dt className="text-sm text-slate-500">{t("Estimated sales for the period")}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{units(row.predicted_quantity)}{t(" units")}</dd></div><div><dt className="text-sm text-slate-500">{t("Estimated order cost")}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{peso(suggestedCost(row))}</dd></div></dl>{admin && !row.supplier_id && <button className="btn-secondary mt-4 w-full" onClick={() => openAssign(row)}><Plus size={16} />{t("Choose supplier")}</button>}</article>)}</div>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><caption className="sr-only">{t("Parts suggested for restocking from ")}{group.name}</caption><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-4 font-semibold">{t("Part")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("In stock")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("Estimated sales")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("Suggested this purchase")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("Estimated cost")}</th><th scope="col" className="px-5 py-4 font-semibold">{t("Stock status")}</th></tr></thead><tbody className="divide-y divide-slate-100">{group.items.map(row => <tr key={row.product_id}><td className="max-w-xs px-5 py-4"><p className="font-semibold text-slate-950">{row.part_number || t('No part number')}</p><p className="mt-1 text-sm leading-6 text-slate-600">{t(row.description)}</p>{admin && !row.supplier_id && <button className="btn-secondary mt-2" onClick={() => openAssign(row)}><Plus size={15} />{t("Choose supplier")}</button>}</td><td className="px-4 py-4 text-right">{units(row.current_stock)}</td><td className="px-4 py-4 text-right">{units(row.predicted_quantity)}</td><td className="px-4 py-4 text-right text-base font-bold text-red-700">{suggested(row)}{t(" units")}</td><td className="whitespace-nowrap px-4 py-4 text-right">{peso(suggestedCost(row))}</td><td className="px-5 py-4"><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div></section>)}</div> : filtered&&rows.length>0 ? <section className="panel p-5 text-center"><EmptyState title={t("No matching parts")} text={t("Try another search or clear the filters.")}/><button className="btn-secondary" onClick={clearFilters}>{t("Clear filters")}</button></section> : <section className="panel px-5 py-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 size={27} /></div><h2 className="mt-4 text-lg font-bold text-slate-950">{t("No parts are currently suggested for restocking")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{t("Based on saved stock limits and available estimates. Keep recording sales and stock deliveries so this list stays useful.")}</p><Link className="btn-secondary mt-5" to="/inventory">{t("Check your inventory ")}<ArrowRight size={16} /></Link></section>}
    </> : <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="text-lg font-bold text-slate-950">{t("Your suppliers")}</h2><p className="mt-1 text-sm text-slate-600">{t("Contact details for the businesses that supply your parts.")}</p></div></div>{visibleSuppliers.length ? <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">{visibleSuppliers.map(item => <article key={item.id} className="border-b border-slate-100 p-5 sm:border-r"><div className="flex items-start gap-3"><div className="rounded-xl bg-slate-50 p-3 text-slate-600"><Truck size={20} /></div><h3 className="min-w-0 self-center break-words font-bold text-slate-950">{item.name}</h3></div><dl className="mt-4 space-y-3 text-sm"><div><dt className="flex items-center gap-2 text-slate-500"><UserRound size={15} />{t("Contact person")}</dt><dd className="mt-1 font-medium text-slate-800">{item.contact_person || t('Not added')}</dd></div><div><dt className="flex items-center gap-2 text-slate-500"><Mail size={15} />{t("Email address")}</dt><dd className="mt-1 break-words font-medium text-slate-800">{item.email || t('Not added')}</dd></div><div><dt className="text-slate-500">{t("Phone number")}</dt><dd className="mt-1 font-medium text-slate-800">{item.phone || t('Not added')}</dd></div>{item.address && <div><dt className="text-slate-500">{t("Address")}</dt><dd className="mt-1 break-words text-slate-800">{item.address}</dd></div>}</dl>{admin && <button className="btn-secondary mt-5 w-full" onClick={() => openSupplier(item)}>{t("Edit contact details")}</button>}</article>)}</div> : <><EmptyState title={supplierQuery?t("No matching suppliers"):t("Add your first supplier")} text={supplierQuery?t("Try another search or clear the filters."):admin ? t('Save a supplier’s name and contact details, then choose them for the parts they provide.') : t('Ask your store manager to add your supplier’s contact details.')} /></>}</section>}

    <HelpDetails title={tab==='reorder'?'Restock help':'Supplier help'} className="mt-4">
      {tab==='reorder'?<><p>{t('Parts at or below their stock limit appear here. Set stock limits in Inventory.')}</p><p>{t('Suggestions start at 1–2 units per part. Check shelf stock, then review the email before sending.')}</p><p>{t('Sales estimates cover the forecast period; costs apply to this purchase only.')}</p><Link className="inline-block min-h-11 py-2 font-semibold text-red-700 underline" to="/inventory">{t('Check stock limits in Inventory')}</Link></>:<p>{t('Save a supplier email address to send order requests. Only the owner or an authorized manager can edit these details.')}</p>}
    </HelpDetails>

    <Modal open={supplierModal} onClose={() => {
      if (!busy) setSupplierModal(false);
    }} title={editingSupplierId ? t('Edit supplier contact details') : t('Add a supplier')} description={t("Start with their name. Add an email address if you want PartCast to send restock requests.")} footer={<><button className="btn-secondary" disabled={Boolean(busy)} onClick={() => setSupplierModal(false)}>{t("Cancel")}</button><button className="btn-primary" form="supplier-form" type="submit" disabled={Boolean(busy)}>{busy === 'supplier' ? t('Saving supplier…') : t('Save supplier')}</button></>}><Form id="supplier-form" onSubmit={createSupplier} className="grid gap-4 sm:grid-cols-2">{supplierError&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{t(supplierError)}</p>}<label className="sm:col-span-2"><span className="label">{t("Supplier name (required)")}</span><input className="input" required minLength={2} maxLength={180} autoComplete="organization" placeholder={t("Business or supplier name")} value={supplier.name} onChange={event => setSupplier({
            ...supplier,
            name: event.target.value
          })} /></label><label><span className="label">{t("Contact person (optional)")}</span><input className="input" maxLength={180} autoComplete="name" placeholder={t("Who should we contact?")} value={supplier.contact_person} onChange={event => setSupplier({
            ...supplier,
            contact_person: event.target.value
          })} /></label><label><span className="label">{t("Email address (optional)")}</span><input type="email" className="input" autoComplete="email" placeholder={t("supplier@example.com")} value={supplier.email} onChange={event => setSupplier({
            ...supplier,
            email: event.target.value
          })} /></label><label><span className="label">{t("Phone number (optional)")}</span><input className="input" type="tel" maxLength={80} autoComplete="tel" value={supplier.phone} onChange={event => setSupplier({
            ...supplier,
            phone: event.target.value
          })} /></label><label className="sm:col-span-2"><span className="label">{t("Address (optional)")}</span><textarea className="input min-h-20" maxLength={500} autoComplete="street-address" value={supplier.address} onChange={event => setSupplier({
            ...supplier,
            address: event.target.value
          })} /></label></Form></Modal>

    <Modal open={Boolean(assign)} onClose={() => {
      if (!busy) setAssign(null);
    }} title={t("Choose a supplier for this part")} description={assign ? `${assign.part_number || 'No part number'} · ${assign.description}` : ''} footer={<><button className="btn-secondary" disabled={Boolean(busy)} onClick={() => setAssign(null)}>{t("Cancel")}</button><button className="btn-primary" form="assign-supplier-form" type="submit" disabled={Boolean(busy)}>{busy === 'assign' ? t('Saving…') : t('Save supplier for part')}</button></>}><Form id="assign-supplier-form" onSubmit={saveAssign} className="space-y-4">{assignError&&<p role="alert" className="text-sm text-red-700">{t(assignError)}</p>}<label><span className="label">{t("Who supplies this part? (required)")}</span><select className="input" required value={assignSupplier} onChange={event => setAssignSupplier(event.target.value)}><option value="">{t("Choose a supplier")}</option>{suppliers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{!suppliers.length && <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">{t("No suppliers have been added yet. Close this window and use \u201CAdd supplier\u201D first.")}</p>}<div className="grid gap-4 sm:grid-cols-2"><label><span id="assign-cost-label" className="label">{t("Cost per unit (\u20B1)")}</span><input className="input" aria-labelledby="assign-cost-label" aria-describedby="assign-cost-help" type="number" min="0" step="0.01" required value={unitCost} onChange={event => setUnitCost(event.target.value)} /><span id="assign-cost-help" className="mt-2 block text-sm text-slate-500">{t("The latest price paid for one unit.")}</span></label><label><span id="assign-time-label" className="label">{t("Usual delivery time (days)")}</span><input className="input" aria-labelledby="assign-time-label" aria-describedby="assign-time-help" type="number" min="0" max="365" step="1" required value={leadTime} onChange={event => setLeadTime(event.target.value)} /><span id="assign-time-help" className="mt-2 block text-sm text-slate-500">{t("How many days delivery normally takes.")}</span></label></div><p className="text-sm leading-6 text-slate-500">{t("This becomes the main supplier used for this part\u2019s restock requests.")}</p></Form></Modal>

    <Modal open={Boolean(emailGroup)} onClose={() => {
      if (!busy) setEmailGroup(null);
    }} size="lg" title={t("Review your supplier email")} description={t("Edit the message and parts below. These exact details will be sent to your saved supplier.")} footer={<><button className="btn-secondary" disabled={Boolean(busy)} onClick={() => setEmailGroup(null)}>{t("Keep reviewing")}</button><button className="btn-primary" disabled={Boolean(busy) || !draft.items.length} onClick={() => send(emailGroup)}><Send size={17} />{busy===emailGroup?.supplierId ? t('Sending email…') : t('Send email to supplier')}</button></>}>
    {emailGroup && <Form id="supplier-email-form" className="space-y-5" onSubmit={e => {
        e.preventDefault();
        send(emailGroup);
      }}>
    <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{t("Send restock request to")}</p><p className="mt-1 font-bold">{emailGroup.name}</p><p className="mt-1 break-words text-sm">{emailGroup.email}</p></div>
    {emailError && <p role="alert" className="text-red-700">{t(emailError)}</p>}
    <fieldset disabled={Boolean(busy)} className="space-y-4"><label className="block"><span className="label">{t("Email subject *")}</span><input className="input" required minLength={2} maxLength={180} value={draft.subject} onChange={e => setDraft({
              ...draft,
              subject: e.target.value
            })} /></label><label className="block"><span className="label">{t("Your message *")}</span><textarea className="input min-h-32" required minLength={2} maxLength={2000} value={draft.message} onChange={e => setDraft({
              ...draft,
              message: e.target.value
            })} /></label>
    <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{t("Customize the email table")}</h3><p className="mt-1 text-sm text-slate-600">{t("Add up to 5 columns, such as Brand, Delivery date, or Notes. These fields are included in this email only.")}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="flex-1"><span className="label">{t("Column name")}</span><input className="input" maxLength={50} value={columnName} onChange={e=>setColumnName(e.target.value)} placeholder={t("For example: Delivery date")} /></label><button type="button" className="btn-secondary sm:self-end" disabled={!columnName.trim()||draft.extra_columns.length>=5} onClick={addColumn}><Plus size={16}/>{t("Add column")}</button></div><div className="mt-3 flex flex-wrap gap-2">{draft.extra_columns.map(c=><button key={c.id} type="button" className="btn-secondary" onClick={()=>removeColumn(c.id)} aria-label={t('Remove column {v0}',{v0:c.label})}>{c.label} ×</button>)}</div></section>
    <SupplierPartPicker key={emailGroup.supplierId} supplierId={emailGroup.supplierId} supplierName={emailGroup.name} choices={emailChoices} itemIds={draft.items.map(item=>item.product_id)} loading={choicesLoading} error={choicesError} onRetry={()=>loadEmailChoices(emailGroup)} onAdd={addPart} disabled={Boolean(busy)} onSaving={saving=>setBusy(saving?'email-part':'')}/>
    <h3 className="font-semibold">{t("Parts to request")}</h3>{draft.items.map(i => <div key={i.product_id} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_100px]"><div className="space-y-3"><label className="block"><span className="label">{t("Part number")}</span><input className="input" maxLength={120} value={i.part_number} onChange={e => editItem(i.product_id, 'part_number', e.target.value)} /></label><label className="block"><span className="label">{t("Description *")}</span><input className="input" required minLength={2} maxLength={500} value={i.description} onChange={e => editItem(i.product_id, 'description', e.target.value)} /></label><label className="block"><span className="label">{t("Unit")}</span><input className="input" maxLength={40} value={i.unit||''} onChange={e=>editItem(i.product_id,'unit',e.target.value)} /></label>{draft.extra_columns.map(c=><label key={c.id} className="block"><span className="label">{c.label}</span><input className="input" maxLength={300} value={i.extra_values?.[c.id]||''} onChange={e=>editItem(i.product_id,'extra_values',{...i.extra_values,[c.id]:e.target.value})}/></label>)}</div><div><label className="block"><span className="label">{t("Quantity *")}</span><input className="input" required type="number" min="0.01" max="999999999999.99" step="0.01" value={i.quantity} onChange={e => editItem(i.product_id, 'quantity', e.target.value)} /></label><button type="button" className="btn-secondary mt-3 w-full" onClick={() => setDraft(d => ({
                ...d,
                items: d.items.filter(x => x.product_id !== i.product_id)
              }))}>{t("Remove")}</button></div></div>)}
    </fieldset><section><h3 className="mb-3 font-semibold">{t("Email table preview")}</h3><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Part number','Description','In stock','Unit','Quantity'].map(label=><th key={label} className="whitespace-nowrap px-3 py-3">{t(label)}</th>)}{draft.extra_columns.map(c=><th key={c.id} className="whitespace-nowrap px-3 py-3">{c.label}</th>)}</tr></thead><tbody>{draft.items.map(i=><tr key={i.product_id} className="border-t border-slate-200"><td className="px-3 py-3">{i.part_number}</td><td className="min-w-48 px-3 py-3">{i.description}</td><td className="px-3 py-3">{units(emailChoices.find(r=>r.product_id===i.product_id)?.current_stock)}</td><td className="px-3 py-3">{i.unit||'units'}</td><td className="px-3 py-3">{i.quantity}</td>{draft.extra_columns.map(c=><td key={c.id} className="min-w-32 px-3 py-3">{i.extra_values?.[c.id]||''}</td>)}</tr>)}</tbody></table></div></section><p className="text-sm text-slate-500">{t("Confirm prices with your supplier. This email does not change stock. Record a delivery when the parts arrive.")}</p>
    </Form>}
    </Modal>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
