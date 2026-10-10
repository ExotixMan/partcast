import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useState } from 'react';
import { CloudCheck, CloudOff, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { prepareOffline, syncOffline } from '../lib/api.js';
import { queueItems, readCache, removeQueued } from '../lib/offline.js';
export default function SyncStatus() {
  useLocale();
  const {
    session
  } = useAuth();
  const [online, setOnline] = useState(navigator.onLine),
    [items, setItems] = useState([]),
    [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [install, setInstall] = useState(null),
    [expanded, setExpanded] = useState(false);
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let live = true,
      running = false,
      rerun = false;
    const refresh = async () => {
      const [q, s] = await Promise.all([queueItems(userId), readCache(userId, '/api/offline-snapshot')]);
      if (live) {
        setItems(q);
        setSaved(s?.savedAt);
      }
    };
    const sync = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      setBusy(true);
      setError('');
      try {
        await syncOffline();
        await prepareOffline();
      } catch (e) {
        if (live) setError(e.message);
      } finally {
        running = false;
        if (live) {
          setBusy(false);
          refresh().catch(() => {});
          if (rerun && navigator.onLine) {
            rerun = false;
            queueMicrotask(sync);
          }
        }
      }
    };
    const connectivity = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        if (running) rerun = true;else sync();
      }
    };
    const offer = e => {
      e.preventDefault();
      setInstall(e);
    };
    refresh().catch(() => {});
    sync();
    const timer = setInterval(sync, 60000);
    const retry = setInterval(async () => {
      if (live && navigator.onLine && (await queueItems(userId)).length) sync();
    }, 5000);
    const reachable = e => setOnline(navigator.onLine && e.detail);
    window.addEventListener('partcast:connection', reachable);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    window.addEventListener('partcast:offline', refresh);
    window.addEventListener('beforeinstallprompt', offer);
    return () => {
      live = false;
      clearInterval(timer);
      clearInterval(retry);
      window.removeEventListener('partcast:connection', reachable);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      window.removeEventListener('partcast:offline', refresh);
      window.removeEventListener('beforeinstallprompt', offer);
    };
  }, [userId]);
  const conflict = items.find(i => i.status === 'conflict');
  return <section className={`border-b px-4 py-3 sm:px-6 lg:px-8 ${!online ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`} aria-label={t("Connection and sync status")}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {online ? <CloudCheck size={17} className="text-emerald-600" /> : <CloudOff size={17} className="text-amber-700" />}
      <span role="status" className="font-semibold">{busy ? t('Saving changes…') : !online ? t('Working offline') : items.length ? t('Changes waiting to send') : t('Connected')}</span>
      <span className="text-sm text-slate-600">{items.length ? t("{v0} unsent transaction{v1}", {
          v0: items.length,
          v1: items.length === 1 ? '' : t('s')
        }) : saved ? t("Inventory saved {v0}", {
          v0: new Date(saved).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })
        }) : t('Saving inventory for offline use…')}</span>
      <div className="ml-auto flex flex-wrap gap-2">
        {items.length > 0 && <button className="min-h-11 rounded-lg px-2 font-semibold text-slate-700 underline underline-offset-4" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t("Review changes")}</button>}
        <button className={`${items.length || error || !online ? 'inline-flex' : 'hidden sm:inline-flex'} min-h-11 items-center gap-2 rounded-lg px-2 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50`} disabled={!navigator.onLine || busy} onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await syncOffline();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}><RefreshCw size={16} />{t("Send changes")}</button>
        {install && <button className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold text-red-700" onClick={async () => {
          await install.prompt();
          setInstall(null);
        }}><Download size={16} />{t("Install app")}</button>}
      </div>
    </div>
    {!online && <p className="mt-2 text-sm leading-6 text-amber-900">{t("You can use saved parts and record sales or deliveries. Keep PartCast open when internet returns; waiting changes will send automatically. Other tasks need internet. Saved access lasts up to 12 hours.")}</p>}
    {(error || conflict) && <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-red-700"><AlertTriangle size={17} className="mt-1 shrink-0" />{conflict ? t('A saved change needs review. Open Review changes to check it before later changes can be sent.') : t(error)}</p>}
    {expanded && <ul className="mt-3 space-y-2">{items.map(i => <li key={i.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"><span>{{
            sale: 'Sale',
            stock_in: 'Received stock',
            stock_out: 'Removed stock'
          }[i.payload.tx_type] || (i.payload.kind==='payment'?t('Customer payment'):i.payload.kind==='debt'?t('Customer utang'):i.payload.tx_type)} · {i.payload.lines ? t("{v0} parts", {
            v0: i.payload.lines.length
          }) : i.payload.kind==='payment'?`₱${i.payload.amount}`:i.payload.kind==='debt'?`₱${i.payload.principal}`:t("{v0} units", {v0:i.payload.quantity})} · {i.payload.reference_no || t('No reference')} · {new Date(i.createdAt).toLocaleString()}</span><span className={i.error ? 'text-red-700' : 'text-slate-600'}>{i.error || t('Waiting to send')}</span>{i.status === 'conflict' && <button className="btn-danger ml-auto" onClick={async () => {
          if (window.confirm(t('Remove this rejected transaction from the device? It has not been applied to the database.'))) {
            await removeQueued(i.key);
            setError('');
            syncOffline().catch(e => setError(e.message));
          }
        }}>{t("Remove rejected change")}</button>}</li>)}</ul>}
  </section>;
}
