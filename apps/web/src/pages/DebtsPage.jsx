import useLiveRefresh from '../hooks/useLiveRefresh.js';
import Form from '../components/Form.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { Plus, Wallet, Search, CheckCircle2, Clock, ChevronDown, History } from 'lucide-react';
import { api } from '../lib/api.js';
import { money, validAmount } from '../lib/store.js';
import { queueItems } from '../lib/offline.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import Toast from '../components/Toast.jsx';
export default function DebtsPage() {
  useLocale();
  const {
    session
  } = useAuth();
  const [pendingLedger,setPendingLedger]=useState([]);
  const [rows, setRows] = useState([]),
    [q, setQ] = useState(''),
    [filter, setFilter] = useState('all'),
    [loading, setLoading] = useState(true),
    [cached, setCached] = useState(false),
    [queued, setQueued] = useState(0);
  const [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [payments, setPayments] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loadError,setLoadError]=useState(''),
    [paymentsLoading,setPaymentsLoading]=useState(false),
    [toast, setToast] = useState(null);
  const [form, setForm] = useState({});
  const guard = useRef(false),
    operation = useRef(null),loadRequest=useRef(0),historyRequest=useRef(0);
  async function load() {
    const request=++loadRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const [r,pending]=await Promise.all([api.get('/api/debts'),queueItems(session.user.id)]);
      if(request!==loadRequest.current)return;
      setRows(r.data || []);
      setCached(!!r.offline);
      setPendingLedger(pending.filter(e=>['debt','payment'].includes(e.payload.kind)));setQueued(pending.filter(e=>e.payload.kind==='batch'&&e.payload.is_credit).length);
    } catch (e) {
      if(request===loadRequest.current)setLoadError(e.message);
    } finally {
      if(request===loadRequest.current)setLoading(false);
    }
  }
  useEffect(() => {
    load();
    window.addEventListener('online', load);
    window.addEventListener('partcast:queue', load);
    return () => {
      loadRequest.current++;historyRequest.current++;
      window.removeEventListener('online', load);
      window.removeEventListener('partcast:queue', load);
    };
  }, []);
  function open(kind, row) {
    if(guard.current||operation.current)return;
    historyRequest.current++;
    setSelected(row || null);
    setModal(kind);
    setError('');
    operation.current = null;
    setForm({
      customer_name: '',
      principal: '',
      phone: '',
      due_date: '',
      reference_no: '',
      notes: '',
      amount: ''
    });
    setPayments([]);
    setPaymentsLoading(false);
    if(row&&kind==='details')loadPayments(row);
  }
  async function loadPayments(row){
    const request=++historyRequest.current;
    setPaymentsLoading(true);setError('');
    try{
      const result=await api.get(`/api/debts/${row.id}/payments`);
      if(!Array.isArray(result.data))throw new Error('The store returned incomplete information. Please try again.');
      if(request===historyRequest.current)setPayments(result.data);
    }catch(error){if(request===historyRequest.current)setError(error.message);}
    finally{if(request===historyRequest.current)setPaymentsLoading(false);}
  }
  function close(){
    if(busy||operation.current)return;
    historyRequest.current++;setPaymentsLoading(false);setModal(null);setError('');
  }
  const update = (key, value) => {
    setError('');
    setForm(f => ({
      ...f,
      [key]: value
    }));
  };
  async function save(e) {
    e.preventDefault();
    if (guard.current) return;
    setError('');
    if (modal === 'add' && (form.customer_name.trim().length < 2 || !validAmount(form.principal, true))) {
      setError('Enter the customer name and a positive amount with up to 2 decimal places.');
      return;
    }
    if (modal === 'payment' && (!validAmount(form.amount, true) || Number(form.amount) > Number(selected.balance))) {
      setError('Enter a payment greater than 0 and no more than the remaining balance.');
      return;
    }
    if (!navigator.onLine || cached) {
      setError('Connect and refresh balances before recording utang or payments. You can record a sale on credit offline from Sell or receive.');
      return;
    }
    guard.current = true;
    setBusy(true);
    if (!operation.current) operation.current = {
      client_operation_id: crypto.randomUUID(),
      occurred_at: new Date().toISOString(),
      ...(modal === 'add' ? {
        kind: 'debt',
        customer_name: form.customer_name.trim(),
        principal: Number(form.principal),
        phone: form.phone.trim() || null,
        due_date: form.due_date || null,
        reference_no: form.reference_no.trim() || null,
        notes: form.notes.trim() || null
      } : {
        kind: 'payment',
        debt_id: selected.id,
        amount: Number(form.amount),
        notes: form.notes.trim() || null
      })
    };
    try {
      const result=await api.post(modal === 'add' ? '/api/debts' : '/api/debts/payment', operation.current);
      operation.current = null;
      setModal(null);
      setToast({
        message: result.queued?'Saved on this device. Wait for confirmation before recording another payment.':modal === 'add' ? 'Customer utang saved.' : 'Payment saved. Remaining balance updated.'
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
  const search = q.trim().toLocaleLowerCase();
  const visible = rows.filter(row => {
    const matchesName = row.customer_name.toLocaleLowerCase().includes(search);
    const stillOwing = Number(row.balance) > 0;
    const matchesStatus = filter === 'all' || filter === 'unpaid' && stillOwing || filter === 'paid' && !stillOwing || filter === 'overdue' && stillOwing && row.status === 'overdue';
    return matchesName && matchesStatus;
  });
  const balance = rows.reduce((sum, row) => sum + Math.round(Number(row.balance) * 100), 0) / 100;
  const owingCustomers = new Set(rows.filter(row => Number(row.balance) > 0).map(row => row.customer_name.toLocaleLowerCase().trim())).size;
  const overdueCount = rows.filter(row => Number(row.balance) > 0 && row.status === 'overdue').length;
  function clearFilters() {
    setQ('');
    setFilter('all');
  }
  useLiveRefresh(load,['customer_debts', 'debt_payments']);

  return <>
    <PageHeader title={t('Customer utang')} actions={<button className="btn-secondary" disabled={cached || !navigator.onLine || loading} onClick={() => open('add')}><Plus size={18} aria-hidden="true" />{t('Add existing utang')}</button>} />
    {!modal && error && <p role="alert" className="mb-4 text-red-700">{t(error)}</p>}
    {loadError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>{t(loadError)}</p><button type="button" className="btn-secondary mt-2" disabled={loading} onClick={load}>{t('Try again')}</button></div>}
    {pendingLedger.length > 0 && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">{t('Customer balance changes are waiting to send. Check Review changes and wait for confirmation before recording another payment.')}</p>}
    {(cached || queued > 0) && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">{cached ? t('These are saved balances. Connect to refresh before recording payments. ') : ''}{queued > 0 ? t('{v0} credit sales are waiting to send. Their utang will appear after syncing.', { v0: queued }) : ''}</p>}
    <section aria-label={t('Customer balances overview')} className="panel mb-5 grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Wallet size={21} aria-hidden="true" /></span><div className="min-w-0"><p className="text-sm text-slate-600">{t('Total remaining utang')}</p><p className="break-words text-xl font-bold sm:text-2xl">{money(balance)}</p></div></div>
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><History size={21} aria-hidden="true" /></span><div><p className="text-sm text-slate-600">{t('Customers still owing')}</p><p className="text-xl font-bold sm:text-2xl">{owingCustomers}</p></div></div>
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800"><Clock size={21} aria-hidden="true" /></span><div><p className="text-sm text-slate-600">{t('Past due')}</p><p className="text-xl font-bold text-red-700 sm:text-2xl">{overdueCount}</p></div></div>
    </section>
    <section className="panel p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
        <label className="min-w-0"><span className="label">{t('Find a customer')}</span><span className="relative block"><Search size={19} aria-hidden="true" className="pointer-events-none absolute left-3 top-4 text-slate-500" /><input className="input pl-10" type="search" value={q} maxLength={240} onChange={e => setQ(e.target.value)} placeholder={t('Customer name')} /></span></label>
        <label><span className="label">{t('Show balances')}</span><select className="input" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t('All balances')}</option><option value="unpaid">{t('Still owing')}</option><option value="overdue">{t('Past due')}</option><option value="paid">{t('Fully paid')}</option></select></label>
      </div>
      <p className="mt-3 text-sm text-slate-600" role="status">{loading ? t('Loading balances…') : t('{v0} balances found', { v0: visible.length })}</p>
      <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
        {visible.map(row => {
          const isPaid = Number(row.balance) <= 0;
          const isOverdue = !isPaid && row.status === 'overdue';
          const StatusIcon = isPaid ? CheckCircle2 : isOverdue ? Clock : Wallet;
          const statusLabel = isPaid ? 'Fully paid' : isOverdue ? 'Past due' : 'Still owing';
          return <article key={row.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 break-words text-lg font-bold">{row.customer_name}</h2><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${isPaid ? 'bg-emerald-50 text-emerald-800' : isOverdue ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}><StatusIcon size={16} aria-hidden="true" />{t(statusLabel)}</span></div>
            <p className="mt-3 text-sm text-slate-600">{t('Remaining utang')}</p><p className="break-words text-2xl font-bold">{money(row.balance)}</p>
            <div className="mt-4 flex flex-wrap gap-2">{!isPaid && <button className="btn-primary flex-1" disabled={cached || !navigator.onLine || pendingLedger.length > 0} onClick={() => open('payment', row)}><Plus size={17} aria-hidden="true" />{t('Record payment')}</button>}<button className="btn-secondary flex-1" onClick={() => open('details', row)}><History size={17} aria-hidden="true" />{t('View payments')}</button></div>
            <details className="group mt-4 border-t border-slate-100 pt-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-slate-700">{t('Balance details')}<ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" /></summary>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-600">{t('Original utang')}</dt><dd className="font-semibold">{money(row.principal)}</dd></div><div><dt className="text-slate-600">{t('Payments received')}</dt><dd className="font-semibold">{money(row.paid_amount)}</dd></div><div><dt className="text-slate-600">{t('Due date')}</dt><dd>{row.due_date || t('No due date')}</dd></div><div className="min-w-0"><dt className="text-slate-600">{t('Reference')}</dt><dd className="break-words">{row.reference_no || t('No reference')}</dd></div>{row.phone && <div className="col-span-2"><dt className="text-slate-600">{t('Customer phone')}</dt><dd className="break-words">{row.phone}</dd></div>}{row.notes && <div className="col-span-2"><dt className="text-slate-600">{t('Note (optional)')}</dt><dd className="whitespace-pre-wrap break-words">{row.notes}</dd></div>}</dl>
            </details>
          </article>;
        })}
      </div>
      {!visible.length && !loadError && <div className="py-8 text-center"><p className="text-slate-600">{loading ? t('Loading balances…') : t('No matching customer balances.')}</p>{!loading && (search || filter !== 'all') && <button type="button" className="btn-secondary mt-3" onClick={clearFilters}>{t('Clear filters')}</button>}</div>}
      <details className="group mt-5 border-t border-slate-100 pt-1"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-slate-700">{t('When to add existing utang')}<ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" /></summary><p className="mt-2 text-sm text-slate-600">{t('For a new credit sale, use Sell or receive and choose “Customer will pay later”. Add existing utang only for balances already owed.')}</p></details>
    </section>
 <Modal open={!!modal} onClose={close} title={modal === 'add' ? t('Add existing customer utang') : modal === 'payment' ? t('Record a customer payment') : t('Payment history')} description={selected ? t("{v0} \xB7 {v1} remaining", {
      v0: selected.customer_name,
      v1: money(selected.balance)
    }) : t('Use this for existing balances. New credit sales are recorded with their stock changes.')} footer={modal !== 'details' ? <><button className="btn-secondary" disabled={busy || !!operation.current} onClick={close}>{t("Cancel")}</button><button className="btn-primary" form="debt-form" type="submit" disabled={busy}>{busy ? t('Saving…') : operation.current ? t('Retry same save') : modal === 'add' ? t('Save utang') : t('Save payment')}</button></> : <button className="btn-secondary" onClick={close}>{t('Close')}</button>}>
 {error && <p role="alert" className="mb-4 text-red-700">{t(error)}</p>}
 {modal === 'details' ? <div className="space-y-3">{paymentsLoading?<p role="status" className="text-slate-600">{t('Loading payments…')}</p>:error?<button className="btn-secondary" onClick={()=>loadPayments(selected)}>{t('Try again')}</button>:payments.length ? payments.map(p => <div key={p.id} className="rounded-xl bg-slate-50 p-4"><strong>{money(p.amount)}</strong><p className="mt-1 text-sm text-slate-500">{new Date(p.paid_at).toLocaleString()}</p>{p.notes && <p className="mt-2 text-sm">{p.notes}</p>}</div>) : <p className="text-slate-500">{t("No payments recorded yet.")}</p>}</div> : <Form id="debt-form" onSubmit={save}><fieldset disabled={busy || !!operation.current} className="space-y-4">
 {modal === 'add' ? <><label className="block"><span className="label">{t("Customer name *")}</span><input className="input" required minLength={2} maxLength={240} value={form.customer_name || ''} onChange={e => update('customer_name', e.target.value)} /></label><label className="block"><span className="label">{t("Amount still owed (\u20B1) *")}</span><input className="input" type="number" required min="0.01" max="999999999999.99" step="0.01" value={form.principal || ''} onChange={e => update('principal', e.target.value)} /></label><label className="block"><span className="label">{t("Customer phone")}</span><input className="input" type="tel" maxLength={80} value={form.phone || ''} onChange={e => update('phone', e.target.value)} /></label><label className="block"><span className="label">{t("Due date")}</span><input className="input" type="date" value={form.due_date || ''} onChange={e => update('due_date', e.target.value)} /><p className="mt-2 text-sm text-slate-500">{t('An existing balance may already be past due. Enter its original due date.')}</p></label><label className="block"><span className="label">{t("Reference number")}</span><input className="input" maxLength={180} value={form.reference_no || ''} onChange={e => update('reference_no', e.target.value)} /></label></> : <label className="block"><span className="label">{t("Amount received (\u20B1) *")}</span><input className="input" type="number" required min="0.01" max={selected?.balance} step="0.01" value={form.amount || ''} onChange={e => update('amount', e.target.value)} /></label>}
 <label className="block"><span className="label">{t("Note (optional)")}</span><textarea className="input" maxLength={1000} value={form.notes || ''} onChange={e => update('notes', e.target.value)} /></label>
 </fieldset>{operation.current && <p className="mt-3 text-sm text-amber-800">{t("Choose Retry same save to confirm this change without recording it twice.")}</p>}</Form>}
 </Modal><Toast toast={toast} onClose={() => setToast(null)} />
 </>;
}
