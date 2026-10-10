import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { Plus, Wallet, Search } from 'lucide-react';
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
    [filter, setFilter] = useState('unpaid'),
    [loading, setLoading] = useState(true),
    [cached, setCached] = useState(false),
    [queued, setQueued] = useState(0);
  const [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [payments, setPayments] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(null);
  const [form, setForm] = useState({});
  const guard = useRef(false),
    operation = useRef(null);
  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/api/debts');
      setRows(r.data || []);
      setCached(!!r.offline);
      const pending=await queueItems(session.user.id);setPendingLedger(pending.filter(e=>['debt','payment'].includes(e.payload.kind)));setQueued(pending.filter(e=>e.payload.kind==='batch'&&e.payload.is_credit).length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    window.addEventListener('online', load);
    window.addEventListener('partcast:queue', load);
    return () => {
      window.removeEventListener('online', load);
      window.removeEventListener('partcast:queue', load);
    };
  }, []);
  function open(kind, row) {
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
    if (row) api.get(`/api/debts/${row.id}/payments`).then(r => setPayments(r.data || [])).catch(e => setError(e.message));
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
  const visible = rows.filter(r => r.customer_name.toLowerCase().includes(q.toLowerCase()) && (filter === 'all' || filter === 'unpaid' && Number(r.balance) > 0 || r.status === filter));
  const balance = rows.reduce((s, r) => s + Math.round(Number(r.balance) * 100), 0) / 100;
  return <>
 <PageHeader title={t("Customer utang")} subtitle={t("See who owes your store and record partial or full payments.")} actions={<button className="btn-primary" disabled={cached || !navigator.onLine || loading} onClick={() => open('add')}><Plus size={18} />{t("Add existing utang")}</button>} />
 {!modal && error && <p role="alert" className="mb-4 text-red-700">{t(error)}</p>}
 {pendingLedger.length>0&&<p role="status" className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">{t("Customer balance changes are waiting to send. Check Review changes and wait for confirmation before recording another payment.")}</p>}
    {(cached || queued > 0) && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">{cached ? t('These are saved balances. Connect to refresh before recording payments. ') : ''}{queued > 0 ? t("{v0} credit sales are waiting to send. Their utang will appear after syncing.", {
        v0: queued
      }) : ''}</p>}
 <section className="mb-5 grid gap-3 sm:grid-cols-3"><div className="panel p-5"><p className="text-sm text-slate-500">{t("Customers still owing")}</p><p className="mt-2 text-2xl font-bold">{new Set(rows.filter(r => Number(r.balance) > 0).map(r => r.customer_name.toLowerCase().trim())).size}</p></div><div className="panel p-5"><p className="text-sm text-slate-500">{t("Total remaining utang")}</p><p className="mt-2 text-2xl font-bold">{money(balance)}</p></div><div className="panel p-5"><p className="text-sm text-slate-500">{t("Past due")}</p><p className="mt-2 text-2xl font-bold text-red-700">{rows.filter(r => r.status === 'overdue').length}</p></div></section>
 <section className="panel p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-2"><label><span className="label">{t("Find a customer")}</span><input className="input" value={q} maxLength={240} onChange={e => setQ(e.target.value)} placeholder={t("Customer name")} /></label><label><span className="label">{t("Show balances")}</span><select className="input" value={filter} onChange={e => setFilter(e.target.value)}><option value="unpaid">{t("Still owing")}</option><option value="overdue">{t("Past due")}</option><option value="paid">{t("Fully paid")}</option><option value="all">{t("All balances")}</option></select></label></div>
 <div className="mt-5 grid gap-4 lg:grid-cols-2">{visible.map(r => <article key={r.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{r.customer_name}</h2><span className={r.status === 'overdue' ? 'font-semibold text-red-700' : 'text-slate-500'}>{r.status === 'paid' ? t('Fully paid') : r.status === 'overdue' ? t('Past due') : t('Still owing')}</span></div><p className="my-3 text-2xl font-bold">{money(r.balance)}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">{t("Original utang")}</dt><dd>{money(r.principal)}</dd></div><div><dt className="text-slate-500">{t("Payments received")}</dt><dd>{money(r.paid_amount)}</dd></div><div><dt className="text-slate-500">{t("Due date")}</dt><dd>{r.due_date || t('No due date')}</dd></div><div><dt className="text-slate-500">{t("Reference")}</dt><dd>{r.reference_no || t('No reference')}</dd></div></dl>{r.phone && <p className="mt-3 text-sm">{r.phone}</p>}{r.notes && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-500">{r.notes}</p>}<div className="mt-4 flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => open('details', r)}>{t("View payments")}</button>{Number(r.balance) > 0 && <button className="btn-primary" disabled={cached || !navigator.onLine || pendingLedger.length>0} onClick={() => open('payment', r)}>{t("Record payment")}</button>}</div></article>)}</div>
 {!visible.length && <p className="py-10 text-center text-slate-500">{loading ? t('Loading balances…') : t('No matching customer balances.')}</p>}
 <p className="mt-5 text-sm text-slate-500">{t("For a new credit sale, use Sell or receive and choose \u201CCustomer will pay later\u201D. Add existing utang only for balances already owed.")}</p></section>
 <Modal open={!!modal} onClose={() => {
      if (!busy && !operation.current) setModal(null);
    }} title={modal === 'add' ? t('Add existing customer utang') : modal === 'payment' ? t('Record a customer payment') : t('Payment history')} description={selected ? t("{v0} \xB7 {v1} remaining", {
      v0: selected.customer_name,
      v1: money(selected.balance)
    }) : t('Use this for existing balances. New credit sales are recorded with their stock changes.')} footer={modal !== 'details' ? <><button className="btn-secondary" disabled={busy || !!operation.current} onClick={() => setModal(null)}>{t("Cancel")}</button><button className="btn-primary" form="debt-form" type="submit" disabled={busy}>{busy ? t('Saving…') : operation.current ? t('Retry same save') : modal === 'add' ? t('Save utang') : t('Save payment')}</button></> : null}>
 {error && <p role="alert" className="mb-4 text-red-700">{t(error)}</p>}
 {modal === 'details' ? <div className="space-y-3">{payments.length ? payments.map(p => <div key={p.id} className="rounded-xl bg-slate-50 p-4"><strong>{money(p.amount)}</strong><p className="mt-1 text-sm text-slate-500">{new Date(p.paid_at).toLocaleString()}</p>{p.notes && <p className="mt-2 text-sm">{p.notes}</p>}</div>) : <p className="text-slate-500">{t("No payments recorded yet.")}</p>}</div> : <form id="debt-form" onSubmit={save}><fieldset disabled={busy || !!operation.current} className="space-y-4">
 {modal === 'add' ? <><label className="block"><span className="label">{t("Customer name *")}</span><input className="input" required minLength={2} maxLength={240} value={form.customer_name || ''} onChange={e => update('customer_name', e.target.value)} /></label><label className="block"><span className="label">{t("Amount still owed (\u20B1) *")}</span><input className="input" type="number" required min="0.01" max="999999999999.99" step="0.01" value={form.principal || ''} onChange={e => update('principal', e.target.value)} /></label><label className="block"><span className="label">{t("Customer phone")}</span><input className="input" type="tel" maxLength={80} value={form.phone || ''} onChange={e => update('phone', e.target.value)} /></label><label className="block"><span className="label">{t("Due date")}</span><input className="input" type="date" value={form.due_date || ''} onChange={e => update('due_date', e.target.value)} /><p className="mt-2 text-sm text-slate-500">{t('An existing balance may already be past due. Enter its original due date.')}</p></label><label className="block"><span className="label">{t("Reference number")}</span><input className="input" maxLength={180} value={form.reference_no || ''} onChange={e => update('reference_no', e.target.value)} /></label></> : <label className="block"><span className="label">{t("Amount received (\u20B1) *")}</span><input className="input" type="number" required min="0.01" max={selected?.balance} step="0.01" value={form.amount || ''} onChange={e => update('amount', e.target.value)} /></label>}
 <label className="block"><span className="label">{t("Note (optional)")}</span><textarea className="input" maxLength={1000} value={form.notes || ''} onChange={e => update('notes', e.target.value)} /></label>
 </fieldset>{operation.current && <p className="mt-3 text-sm text-amber-800">{t("Choose Retry same save to confirm this change without recording it twice.")}</p>}</form>}
 </Modal><Toast toast={toast} onClose={() => setToast(null)} />
 </>;
}
