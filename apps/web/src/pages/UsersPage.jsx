import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, UserRound } from 'lucide-react';
import {useAuth} from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Loading from '../components/Loading.jsx';
import Toast from '../components/Toast.jsx';
const blank = {
  fullName: '',
  email: '',
  password: '',
  role: 'inventory_staff'
};
const allRoles = {
  super_admin: 'Super Admin',
  cashier: 'Cashier',
  inventory_staff: 'Inventory staff',
  admin: 'Admin',
  owner: 'Owner'
};
export default function UsersPage() {
  useLocale();
  const {profile} = useAuth();
  const roles = Object.fromEntries(Object.entries(allRoles).filter(([r])=>profile?.role==='super_admin'||!['super_admin','owner'].includes(r)));
  const editable = user => user.id!==profile?.id && (profile?.role==='super_admin'||!['super_admin','owner'].includes(user.role));
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState('');
  const [toast, setToast] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [users, activity] = await Promise.all([api.get('/api/admin/users'), api.get('/api/admin/audit')]);
      setRows(users.data || []);
      setAudit(activity.data || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function create(event) {
    event.preventDefault();
    if (busy) return;
    if (form.fullName.trim().length<2) {
      setToast({
        type: 'error',
        message: 'Enter the staff member’s full name.'
      });
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/admin/users', {
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim()
      });
      setForm(blank);
      setModal(false);
      setToast({
        message: 'Staff account created. Share their sign-in details privately.'
      });
      load();
    } catch (cause) {
      setToast({
        type: 'error',
        message: cause.message
      });
    } finally {
      setBusy(false);
    }
  }
  async function change(user, patch) {
    if (changing) return;
    const name = user.full_name || user.email;
    if (patch.active === false && !window.confirm(`Turn off access for ${name}? They will no longer be able to use PartCast until access is restored.`)) return;
    if ((patch.role === 'admin' || patch.role === 'owner') && !window.confirm(t('Give {v0} {v1} access? This allows them to manage more of your store.',{v0:name,v1:t(allRoles[patch.role])}))) return;
    setChanging(user.id);
    try {
      await api.patch(`/api/admin/users/${user.id}`, patch);
      setToast({
        message: 'Staff access updated.'
      });
      load();
    } catch (cause) {
      setToast({
        type: 'error',
        message: cause.message
      });
    } finally {
      setChanging('');
    }
  }
  return <>
    <PageHeader title={t("Staff access")} subtitle={t("Choose who can use PartCast and what each person is allowed to manage.")} actions={<button className="btn-primary" onClick={() => setModal(true)}><Plus size={17} aria-hidden="true" />{t("Add staff account")}</button>} />
    {loading ? <Loading label={t("Loading staff accounts…")} /> : error ? <div className="panel space-y-3 p-5" role="alert"><h2 className="font-semibold">{t("Staff accounts could not be loaded")}</h2><p className="text-sm text-red-700">{t(error)}</p><button className="btn-secondary" onClick={load}>{t("Try again")}</button></div> : <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="font-bold">{t("Staff accounts")}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{t("Cashiers sell and receive parts. Owners manage the store. Super Admin manages technical settings and all accounts.")}</p></div></div>
        {!rows.length ? <EmptyState title={t("No staff accounts to show")} text={t("Choose “Add staff account” to give someone access to your store.")} /> : <div className="divide-y divide-slate-100">{rows.map(user => <article key={user.id} className="space-y-4 px-5 py-5"><div className="flex min-w-0 items-center gap-3"><div className="rounded-full bg-slate-100 p-3"><UserRound size={20} aria-hidden="true" /></div><div className="min-w-0"><h3 className="break-words font-semibold text-slate-900">{user.full_name || user.email}</h3><p className="mt-1 break-all text-sm text-slate-600">{user.email}</p></div></div><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="block flex-1" htmlFor={`staff-role-${user.id}`}><span className="label">{t("Account access")}</span><select id={`staff-role-${user.id}`} className="input" aria-label={t("Account access for {v0}", {
                  v0: user.full_name || user.email
                })} disabled={Boolean(changing)||!editable(user)} value={user.role} onChange={event => change(user, {
                  role: event.target.value
                })}>{!roles[user.role] && <option value={user.role}>{t(allRoles[user.role])}</option>}{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><div className="flex items-center gap-3 sm:pb-0.5"><span className={`text-sm font-semibold ${user.active ? 'text-emerald-700' : 'text-slate-500'}`}>{user.active ? t('Access is on') : t('Access is off')}</span><button className="btn-secondary flex-1 sm:flex-none" disabled={Boolean(changing)||!editable(user)} aria-label={t("{v0} access for {v1}", {
                  v0: user.active ? t('Turn off') : t('Restore'),
                  v1: user.full_name || user.email
                })} onClick={() => change(user, {
                  active: !user.active
                })}>{changing === user.id ? t('Updating…') : user.active ? t('Turn off access') : t('Restore access')}</button></div></div></article>)}</div>}
      </section>
      <section className="panel overflow-hidden"><div className="panel-header"><div><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-emerald-600" aria-hidden="true" /><h2 className="font-bold">{t("Recent account activity")}</h2></div><p className="mt-1 text-sm text-slate-600">{t("A record of changes made in your store.")}</p></div></div>
        {!audit.length ? <EmptyState title={t("No activity to show yet")} text={t("Saved account and store changes will appear here.")} /> : <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">{audit.slice(0, 60).map(activity => <article className="px-5 py-4" key={activity.id}><h3 className="text-sm font-semibold capitalize">{String(activity.action || 'Store activity').replaceAll('_', ' ')}</h3><p className="mt-1 break-words text-sm text-slate-600">{activity.entity_type}{activity.entity_id ? ` · ${activity.entity_id}` : ''}</p><time className="mt-2 block text-sm text-slate-500" dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time></article>)}</div>}
      </section>
    </div>}
    <Modal open={modal} onClose={() => {
      if (!busy) setModal(false);
    }} title={t("Add staff account")} description={t("Create sign-in details for a trusted staff member. Required fields are marked with an asterisk.")} footer={<><button className="btn-secondary" disabled={busy} onClick={() => setModal(false)}>{t("Cancel")}</button><button className="btn-primary" type="submit" form="new-staff-account" disabled={busy}>{busy ? t('Creating account…') : t('Create staff account')}</button></>}>
      <form id="new-staff-account" className="space-y-4" onSubmit={create}><label className="block" htmlFor="staff-name"><span className="label">{t("Full name *")}</span><input id="staff-name" className="input" minLength={2} maxLength={120} required autoComplete="name" value={form.fullName} onChange={event => setForm({
            ...form,
            fullName: event.target.value
          })} /></label><label className="block" htmlFor="staff-email"><span className="label">{t("Email address *")}</span><input id="staff-email" type="email" maxLength={254} required autoComplete="email" className="input" value={form.email} onChange={event => setForm({
            ...form,
            email: event.target.value
          })} /></label><label className="block" htmlFor="staff-password"><span className="label">{t("Temporary password *")}</span><input id="staff-password" type="password" required minLength={10} autoComplete="new-password" aria-describedby="staff-password-help" className="input" value={form.password} onChange={event => setForm({
            ...form,
            password: event.target.value
          })} /><span id="staff-password-help" className="mt-2 block text-sm leading-6 text-slate-600">{t("Use at least 10 characters. Share it privately and ask the staff member to change it in My account.")}</span></label><label className="block" htmlFor="staff-new-role"><span className="label">{t("Account access")}</span><select id="staff-new-role" className="input" value={form.role} onChange={event => setForm({
            ...form,
            role: event.target.value
          })}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label></form>
    </Modal>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
