import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useState } from 'react';
import { MailCheck, Save, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import Loading from '../components/Loading.jsx';
import Toast from '../components/Toast.jsx';
const fields = [{
  key: 'supplier_email_cooldown_days',
  label: 'Wait between supplier emails (days)',
  min: 1,
  max: 30,
  fallback: 3,
  help: 'Wait this many days before sending the same restock request again.'
}, {
  key: 'backup_retention_days',
  label: 'Keep backup copies for (days)',
  min: 1,
  max: 365,
  fallback: 30,
  help: 'Older backup copies can be removed by the scheduled cleanup.'
}, {
  key: 'forecast_horizon_days',
  label: 'Plan stock for the next (days)',
  min: 7,
  max: 90,
  fallback: 30,
  help: 'The number of days used when estimating future demand.'
}];
export default function SettingsPage() {
  useLocale();
  const [settings, setSettings] = useState({});
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [saved, system] = await Promise.all([api.get('/api/admin/settings'), api.get('/api/admin/store-status')]);
      const values = {};
      for (const row of saved.data || []) values[row.key] = row.value;
      setSettings(values);
      setStatus(system);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(event) {
    event.preventDefault();
    if (busy || loading || error) return;
    setBusy(true);
    try {
      for (const [key, value] of Object.entries(settings)) await api.patch(`/api/admin/settings/${key}`, {
        value
      });
      setToast({
        message: 'Store settings saved.'
      });
    } catch (cause) {
      setToast({
        type: 'error',
        message: cause.message
      });
    } finally {
      setBusy(false);
    }
  }
  return <>
    <PageHeader title={t("Settings")} subtitle={t("Choose how your store handles automatic restock emails, backups, and stock planning.")} actions={<button className="btn-primary" type="submit" form="store-settings" disabled={busy || loading || Boolean(error)}><Save size={17} aria-hidden="true" />{busy ? t('Saving settings…') : t('Save settings')}</button>} />
    {loading ? <Loading label={t("Loading store settings…")} /> : error ? <div className="panel space-y-3 p-5" role="alert"><h2 className="font-semibold">{t("Settings could not be loaded")}</h2><p className="text-sm text-red-700">{t(error)}</p><button className="btn-secondary" onClick={load}>{t("Try again")}</button></div> : <form id="store-settings" onSubmit={save} className="grid gap-5 lg:grid-cols-2">
      <section className="panel p-5 sm:p-6"><h2 className="text-lg font-bold">{t("Automatic tasks")}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{t("These choices apply when your store\u2019s scheduled daily tasks run.")}</p><div className="mt-5 space-y-5">
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-4" htmlFor="auto-supplier-email"><div><span className="block font-semibold text-slate-900">{t("Email suppliers when stock needs restocking")}</span><span className="mt-1 block text-sm leading-6 text-slate-600">{t("Send restock requests for parts assigned to a supplier. Leave this off if you want to contact suppliers yourself.")}</span></div><input id="auto-supplier-email" type="checkbox" className="mt-1 size-5 shrink-0" checked={Boolean(settings.auto_supplier_email_enabled)} onChange={event => setSettings({
              ...settings,
              auto_supplier_email_enabled: event.target.checked
            })} /></label>
        {fields.map(field => <label key={field.key} className="block" htmlFor={`setting-${field.key}`}><span className="label">{t(field.label)}</span><input id={`setting-${field.key}`} type="number" required min={field.min} max={field.max} step={1} className="input" aria-describedby={`help-${field.key}`} value={settings[field.key] ?? field.fallback} onChange={event => setSettings({
              ...settings,
              [field.key]: event.target.value === '' ? '' : Number(event.target.value)
            })} /><span id={`help-${field.key}`} className="mt-2 block text-sm leading-6 text-slate-600">{field.help}</span></label>)}
      </div></section>
      <div className="space-y-5"><section className="panel p-5 sm:p-6"><div className="flex items-start gap-3"><MailCheck className={`mt-0.5 shrink-0 ${status?.emailConfigured ? 'text-emerald-600' : 'text-amber-600'}`} size={23} aria-hidden="true" /><div><h2 className="text-lg font-bold">{t("Supplier email")}</h2><p className={`mt-2 font-semibold ${status?.emailConfigured ? 'text-emerald-700' : 'text-amber-800'}`}>{status?.emailConfigured ? t('Ready to send emails') : t('Email setup is needed')}</p><p className="mt-2 text-sm leading-6 text-slate-600">{status?.emailConfigured ? t('Your email service is connected. Suppliers need an email address saved before requests can be sent.') : t('Ask the person who manages your website to connect the email service before enabling automatic supplier emails.')}</p></div></div></section>
        <section className="panel p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={23} aria-hidden="true" /><div><h2 className="text-lg font-bold">{t("How your data is protected")}</h2><ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600"><li>{t("Staff can only use the features allowed by their account access.")}</li><li>{t("Stock changes stay recorded in your store history.")}</li><li>{t("Backup files are private and download links expire.")}</li><li>{t("Only the store owner can manage these settings.")}</li></ul></div></div></section>
      </div>
    </form>}
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
