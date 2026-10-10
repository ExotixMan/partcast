import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Mail, Package, Plus, RefreshCw, Send, Truck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Loading from '../components/Loading.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { validAmount } from '../lib/store.js';
import Toast from '../components/Toast.jsx';
const peso = value => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
}).format(Number(value || 0));
const units = value => Number(value || 0).toLocaleString(undefined, {
  maximumFractionDigits: 1
});
const suggested = row => Math.ceil(Number(row.recommended_quantity || 0));
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
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplier, setSupplier] = useState(blankSupplier);
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [assign, setAssign] = useState(null);
  const [assignSupplier, setAssignSupplier] = useState('');
  const [unitCost, setUnitCost] = useState(0);
  const [leadTime, setLeadTime] = useState(7);
  const [emailGroup, setEmailGroup] = useState(null);
  const [draft, setDraft] = useState({
      subject: '',
      message: '',
      items: []
    }),
    [emailError, setEmailError] = useState('');
  function reviewEmail(group) {
    setEmailGroup(group);
    setEmailError('');
    setDraft({
      subject: 'NPG Autoparts - Parts order request',
      message: 'Hello, please confirm availability, prices, and delivery time for the parts below. Thank you.',
      items: group.items.map(r => ({
        product_id: r.product_id,
        part_number: r.part_number || '',
        description: r.description,
        quantity: String(suggested(r))
      }))
    });
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
  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const [r, s] = await Promise.all([api.get('/api/reorder?onlyNeeded=true'), api.get('/api/suppliers')]);
      setRows(r.data || []);
      setSuppliers(s.data || []);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const groups = useMemo(() => {
    const result = new Map();
    for (const row of rows) {
      const key = row.supplier_id || 'unassigned';
      if (!result.has(key)) result.set(key, {
        supplierId: row.supplier_id,
        name: row.supplier_name || 'Choose a supplier for these parts',
        email: row.supplier_email,
        items: []
      });
      result.get(key).items.push(row);
    }
    return [...result.values()];
  }, [rows]);
  const outOfStock = rows.filter(row => String(row.status).includes('out')).length;
  const unassigned = rows.filter(row => !row.supplier_id).length;
  function openSupplier(item = null) {
    if (busy) return;
    setEditingSupplierId(item?.id || '');
    setSupplier(item ? Object.fromEntries(Object.keys(blankSupplier).map(key => [key, item[key] || ''])) : blankSupplier);
    setSupplierModal(true);
  }
  async function createSupplier(event) {
    event.preventDefault();
    if (busy || supplier.name.trim().length < 2) return;
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
      setToast({
        type: 'error',
        message: error.message
      });
    } finally {
      setBusy('');
    }
  }
  function openAssign(row) {
    setAssign(row);
    setAssignSupplier('');
    setUnitCost(row.estimated_unit_cost || 0);
    setLeadTime(7);
  }
  async function saveAssign(event) {
    event.preventDefault();
    if (busy || !assignSupplier) return;
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
      setToast({
        type: 'error',
        message: error.message
      });
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
      setToast({
        type: 'error',
        message: error.message
      });
    } finally {
      setBusy('');
    }
  }
  return <>
    <PageHeader title={t("Restock & suppliers")} subtitle={t("See what is running low, check the suggested amounts, and contact your supplier.")} actions={<><button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={17} />{loading ? t('Checking stock…') : t('Refresh list')}</button>{admin && <button className="btn-primary" onClick={() => openSupplier()}><Plus size={17} />{t("Add supplier")}</button>}</>} />

    <div className="mb-5 flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:w-fit" role="group" aria-label={t("Restock pages")}><button className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${tab === 'reorder' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('reorder')} aria-pressed={tab === 'reorder'}><Package size={17} />{t("Parts to restock")}</button><button className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${tab === 'suppliers' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('suppliers')} aria-pressed={tab === 'suppliers'}><Truck size={17} />{t("Suppliers")}</button></div>

    {loading ? <Loading label={t("Checking parts and suppliers…")} /> : loadError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">{t("We could not load your restock list.")}</h2><p className="mt-2 text-sm text-amber-900">{t(loadError)}</p><button className="btn-secondary mt-4" onClick={load}>{t("Try again")}</button></div> : tab === 'reorder' ? <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="panel p-4 sm:p-5"><p className="text-sm font-medium text-slate-600">{t("Parts to review")}</p><p className="mt-2 text-3xl font-bold text-slate-950">{rows.length}</p><p className="mt-1 text-sm text-slate-500">{t("Suggested for your next order")}</p></div><div className="panel p-4 sm:p-5"><p className="text-sm font-medium text-slate-600">{t("Out of stock")}</p><p className={`mt-2 text-3xl font-bold ${outOfStock ? 'text-red-700' : 'text-slate-950'}`}>{outOfStock}</p><p className="mt-1 text-sm text-slate-500">{t("Check these parts first")}</p></div><div className="panel p-4 sm:p-5"><p className="text-sm font-medium text-slate-600">{t("Need a supplier")}</p><p className="mt-2 text-3xl font-bold text-slate-950">{unassigned}</p><p className="mt-1 text-sm text-slate-500">{t("Choose who supplies each part")}</p></div></div>
      {groups.length > 0 ? <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-slate-950">{t("Before you order")}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{t("1. Check the quantity on your shelves. \xA0 2. Review the suggested amount. \xA0 3. Contact your supplier to confirm price and availability.")}</p><p className="mt-2 text-sm leading-6 text-slate-500">{t("Suggestions use your stock limits and available demand estimates. Emailing a supplier does not add stock to PartCast.")}</p></section>{groups.map(group => <section key={group.supplierId || 'unassigned'} className="panel overflow-hidden"><div className="panel-header"><div className="flex min-w-0 items-start gap-3"><div className="shrink-0 rounded-xl bg-red-50 p-3 text-red-700"><Truck size={21} /></div><div className="min-w-0"><h2 className="font-bold text-slate-950">{group.name}</h2><p className="mt-1 break-words text-sm text-slate-600">{group.supplierId ? group.email || t('An email address is needed to email this supplier.') : admin ? t('Choose a supplier below before sending an email.') : t('Ask your store manager to choose a supplier.')}</p><p className="mt-1 text-sm text-slate-500">{group.items.length}{t(" part")}{group.items.length === 1 ? '' : t('s')}{t(" to review")}</p></div></div>{admin && group.supplierId && (group.email ? <button className="btn-primary shrink-0" disabled={Boolean(busy)} onClick={() => reviewEmail(group)}><Mail size={17} />{t("Review supplier email")}</button> : <button className="btn-secondary shrink-0" disabled={!suppliers.some(item => item.id === group.supplierId)} onClick={() => openSupplier(suppliers.find(item => item.id === group.supplierId))}><Plus size={17} />{t("Add email address")}</button>)}</div>
        <div className="divide-y divide-slate-100 lg:hidden">{group.items.map(row => <article key={row.product_id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-red-700">{row.part_number || t('No part number')}</p><StatusBadge status={row.status} /></div><h3 className="mt-2 font-bold leading-6 text-slate-950">{t(row.description)}</h3><dl className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-sm text-slate-600">{t("In stock now")}</dt><dd className="mt-1 text-lg font-semibold">{units(row.current_stock)}{t(" units")}</dd></div><div className="rounded-xl bg-red-50 p-3"><dt className="text-sm text-red-700">{t("Suggested order")}</dt><dd className="mt-1 text-lg font-bold text-red-800">{suggested(row)}{t(" units")}</dd></div><div><dt className="text-sm text-slate-500">{t("Estimated sales ahead")}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{units(row.predicted_quantity)}{t(" units")}</dd></div><div><dt className="text-sm text-slate-500">{t("Estimated order cost")}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{peso(row.estimated_order_cost)}</dd></div></dl>{admin && !row.supplier_id && <button className="btn-secondary mt-4 w-full" onClick={() => openAssign(row)}><Plus size={16} />{t("Choose supplier")}</button>}</article>)}</div>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><caption className="sr-only">{t("Parts suggested for restocking from ")}{group.name}</caption><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-4 font-semibold">{t("Part")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("In stock")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("Estimated sales")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("Suggested order")}</th><th scope="col" className="px-4 py-4 text-right font-semibold">{t("Estimated cost")}</th><th scope="col" className="px-5 py-4 font-semibold">{t("Stock status")}</th></tr></thead><tbody className="divide-y divide-slate-100">{group.items.map(row => <tr key={row.product_id}><td className="max-w-xs px-5 py-4"><p className="font-semibold text-slate-950">{row.part_number || t('No part number')}</p><p className="mt-1 text-sm leading-6 text-slate-600">{t(row.description)}</p>{admin && !row.supplier_id && <button className="btn-secondary mt-2" onClick={() => openAssign(row)}><Plus size={15} />{t("Choose supplier")}</button>}</td><td className="px-4 py-4 text-right">{units(row.current_stock)}</td><td className="px-4 py-4 text-right">{units(row.predicted_quantity)}</td><td className="px-4 py-4 text-right text-base font-bold text-red-700">{suggested(row)}{t(" units")}</td><td className="whitespace-nowrap px-4 py-4 text-right">{peso(row.estimated_order_cost)}</td><td className="px-5 py-4"><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div><p className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500 sm:px-5">{t("Sales estimates cover the remaining forecast period. Costs use the saved unit price; confirm the final price with your supplier.")}</p></section>)}</div> : <section className="panel px-5 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 size={27} /></div><h2 className="mt-4 text-lg font-bold text-slate-950">{t("No parts are currently suggested for restocking")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{t("Based on saved stock limits and available estimates. Keep recording sales and stock deliveries so this list stays useful.")}</p><Link className="btn-secondary mt-5" to="/inventory">{t("Check your inventory ")}<ArrowRight size={16} /></Link></section>}
    </> : <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="text-lg font-bold text-slate-950">{t("Your suppliers")}</h2><p className="mt-1 text-sm text-slate-600">{t("Contact details for the businesses that supply your parts.")}</p></div></div>{suppliers.length ? <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">{suppliers.map(item => <article key={item.id} className="border-b border-slate-100 p-5 sm:border-r"><div className="flex items-start gap-3"><div className="rounded-xl bg-slate-50 p-3 text-slate-600"><Truck size={20} /></div><h3 className="min-w-0 self-center break-words font-bold text-slate-950">{item.name}</h3></div><dl className="mt-4 space-y-3 text-sm"><div><dt className="flex items-center gap-2 text-slate-500"><UserRound size={15} />{t("Contact person")}</dt><dd className="mt-1 font-medium text-slate-800">{item.contact_person || t('Not added')}</dd></div><div><dt className="flex items-center gap-2 text-slate-500"><Mail size={15} />{t("Email address")}</dt><dd className="mt-1 break-words font-medium text-slate-800">{item.email || t('Not added')}</dd></div><div><dt className="text-slate-500">{t("Phone number")}</dt><dd className="mt-1 font-medium text-slate-800">{item.phone || t('Not added')}</dd></div>{item.address && <div><dt className="text-slate-500">{t("Address")}</dt><dd className="mt-1 break-words text-slate-800">{item.address}</dd></div>}</dl>{admin && <button className="btn-secondary mt-5 w-full" onClick={() => openSupplier(item)}>{t("Edit contact details")}</button>}</article>)}</div> : <><EmptyState title={t("Add your first supplier")} text={admin ? t('Save a supplier’s name and contact details, then choose them for the parts they provide.') : t('Ask your store manager to add your supplier’s contact details.')} />{admin && <div className="px-5 pb-6 text-center"><button className="btn-primary" onClick={() => openSupplier()}><Plus size={17} />{t("Add supplier")}</button></div>}</>}</section>}

    <Modal open={supplierModal} onClose={() => {
      if (!busy) setSupplierModal(false);
    }} title={editingSupplierId ? t('Edit supplier contact details') : t('Add a supplier')} description={t("Start with their name. Add an email address if you want PartCast to send restock requests.")} footer={<><button className="btn-secondary" disabled={Boolean(busy)} onClick={() => setSupplierModal(false)}>{t("Cancel")}</button><button className="btn-primary" form="supplier-form" type="submit" disabled={busy === 'supplier' || supplier.name.trim().length < 2}>{busy === 'supplier' ? t('Saving supplier…') : t('Save supplier')}</button></>}><form id="supplier-form" onSubmit={createSupplier} className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="label">{t("Supplier name (required)")}</span><input className="input" required minLength={2} maxLength={180} autoComplete="organization" placeholder={t("Business or supplier name")} value={supplier.name} onChange={event => setSupplier({
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
          })} /></label></form></Modal>

    <Modal open={Boolean(assign)} onClose={() => {
      if (!busy) setAssign(null);
    }} title={t("Choose a supplier for this part")} description={assign ? `${assign.part_number || 'No part number'} · ${assign.description}` : ''} footer={<><button className="btn-secondary" disabled={Boolean(busy)} onClick={() => setAssign(null)}>{t("Cancel")}</button><button className="btn-primary" form="assign-supplier-form" type="submit" disabled={busy === 'assign' || !assignSupplier}>{busy === 'assign' ? t('Saving…') : t('Save supplier for part')}</button></>}><form id="assign-supplier-form" onSubmit={saveAssign} className="space-y-4"><label><span className="label">{t("Who supplies this part? (required)")}</span><select className="input" required value={assignSupplier} onChange={event => setAssignSupplier(event.target.value)}><option value="">{t("Choose a supplier")}</option>{suppliers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{!suppliers.length && <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">{t("No suppliers have been added yet. Close this window and use \u201CAdd supplier\u201D first.")}</p>}<div className="grid gap-4 sm:grid-cols-2"><label><span className="label">{t("Cost per unit (\u20B1)")}</span><input className="input" type="number" min="0" step="0.01" required value={unitCost} onChange={event => setUnitCost(event.target.value)} /><span className="mt-2 block text-sm text-slate-500">{t("The latest price paid for one unit.")}</span></label><label><span className="label">{t("Usual delivery time (days)")}</span><input className="input" type="number" min="0" max="365" step="1" required value={leadTime} onChange={event => setLeadTime(event.target.value)} /><span className="mt-2 block text-sm text-slate-500">{t("How many days delivery normally takes.")}</span></label></div><p className="text-sm leading-6 text-slate-500">{t("This becomes the main supplier used for this part\u2019s restock requests.")}</p></form></Modal>

    <Modal open={Boolean(emailGroup)} onClose={() => {
      if (!busy) setEmailGroup(null);
    }} size="lg" title={t("Review your supplier email")} description={t("Edit the message and parts below. These exact details will be sent to your saved supplier.")} footer={<><button className="btn-secondary" disabled={Boolean(busy)} onClick={() => setEmailGroup(null)}>{t("Keep reviewing")}</button><button className="btn-primary" disabled={Boolean(busy) || !draft.items.length} onClick={() => send(emailGroup)}><Send size={17} />{busy ? t('Sending email…') : t('Send email to supplier')}</button></>}>
    {emailGroup && <form id="supplier-email-form" className="space-y-5" onSubmit={e => {
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
    <h3 className="font-semibold">{t("Parts to request")}</h3>{draft.items.map(i => <div key={i.product_id} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_100px]"><div className="space-y-3"><label className="block"><span className="label">{t("Part number")}</span><input className="input" maxLength={120} value={i.part_number} onChange={e => editItem(i.product_id, 'part_number', e.target.value)} /></label><label className="block"><span className="label">{t("Description *")}</span><input className="input" required minLength={2} maxLength={500} value={i.description} onChange={e => editItem(i.product_id, 'description', e.target.value)} /></label></div><div><label className="block"><span className="label">{t("Quantity *")}</span><input className="input" required type="number" min="0.01" max="999999999999.99" step="0.01" value={i.quantity} onChange={e => editItem(i.product_id, 'quantity', e.target.value)} /></label><button type="button" className="btn-secondary mt-3 w-full" onClick={() => setDraft(d => ({
                ...d,
                items: d.items.filter(x => x.product_id !== i.product_id)
              }))}>{t("Remove")}</button></div></div>)}
    </fieldset><p className="text-sm text-slate-500">{t("Confirm prices with your supplier. This email does not change stock. Record a delivery when the parts arrive.")}</p>
    </form>}
    </Modal>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
