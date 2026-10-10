import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, PackageX, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';
export default function NotificationCenter() {
  useLocale();
  const {profile} = useAuth();
  const request = useRef(0), live = useRef(true);
  const [marking,setMarking] = useState('');
  const [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false),
    [loading, setLoading] = useState(true);
  const load = async () => {
    const n=++request.current;
    setLoading(true);
    try {const result=await api.get('/api/notifications');if(live.current && n===request.current){setRows(result.data||[]);setOffline(Boolean(result.offline));setError('');}}
    catch(e){if(live.current && n===request.current)setError(e.message);}
    finally{if(live.current && n===request.current)setLoading(false);}
  };
  useEffect(()=>{live.current=true;load();const timer=setInterval(load,60000);window.addEventListener('online',load);window.addEventListener('partcast:queue',load);return()=>{live.current=false;request.current++;clearInterval(timer);window.removeEventListener('online',load);window.removeEventListener('partcast:queue',load);};},[]);
  async function mark(row) {
    if(marking)return;setMarking(row.id);request.current++;
    try {
      await api.post(`/api/notifications/${row.id}/read`, {});
      setRows(current => current.map(r => r.id === row.id ? {
        ...r,
        read: true
      } : r));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {setMarking('');setLoading(false);}
  }
  const count = rows.filter(r => !r.read).length;
  return <>
    <button aria-label={t("Stock notifications{v0}", {
      v0: count ? t(", {v0} unread", {
        v0: count
      }) : ''
    })} aria-haspopup="dialog" onClick={() => {setOpen(true);load();}} className="relative inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Bell size={20} /><span className="hidden sm:inline">{t("Alerts")}</span>{count > 0 && <span className="absolute -right-1 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{count > 99 ? '99+' : count}</span>}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={t("Stock notifications")} description={offline ? t('These are saved alerts. Connect to check for new ones.') : t('Check parts running low and decide what to order.')} size="md">
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><p>{t(error)}</p><button className="btn-secondary mt-3" onClick={load} disabled={loading}>{t("Check alerts again")}</button></div>}
      {loading && !rows.length ? <Loading label={t("Checking stock alerts…")} /> : rows.length ? <div className="space-y-3">{rows.map(r => <article key={r.id} className={`rounded-xl border p-4 ${r.read ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3">{r.kind === 'out' ? <PackageX className="mt-1 shrink-0 text-red-700" size={22} /> : <AlertTriangle className="mt-1 shrink-0 text-amber-700" size={22} />}<div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{r.product?.description ? t(r.kind==='out'?'Out of stock: {v0}':'Running low: {v0}',{v0:r.product.description}):t(r.title)}</h3><p className="mt-1 text-sm leading-6 text-slate-700">{r.product ? t('Available: {v0} {v1}. Low-stock level: {v2}.',{v0:r.product.current_stock,v1:r.product.unit||t('units'),v2:r.product.minimum_stock}):t(r.message)}</p><p className="mt-2 text-xs text-slate-600">{new Date(r.created_at).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary" to={profile?.role==='cashier'?`/inventory?status=${r.kind==='out'?'out':'low'}`:'/reorder'} onClick={() => setOpen(false)}>{profile?.role==='cashier'?t("View inventory"):t("Review restocking")}</Link>{!r.read && <button className="btn-secondary" disabled={offline||Boolean(marking)} onClick={() => mark(r)}>{t("Mark as read")}</button>}</div></div></div></article>)}</div> : !error && <div className="py-8 text-center"><CheckCircle2 size={32} className="mx-auto text-slate-400" /><h3 className="mt-3 font-semibold text-slate-900">{t("No stock alerts to show")}</h3><p className="mt-2 text-sm text-slate-600">{t("Low-stock and out-of-stock alerts appear here.")}</p></div>}
    </Modal>
  </>;
}
