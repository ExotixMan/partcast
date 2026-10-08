import { useEffect, useState } from 'react';
import { CloudCheck, CloudOff, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { prepareOffline, syncOffline } from '../lib/api.js';
import { queueItems, readCache, removeQueued } from '../lib/offline.js';

export default function SyncStatus() {
  const { session } = useAuth();
  const [online,setOnline] = useState(navigator.onLine), [items,setItems] = useState([]), [saved,setSaved] = useState(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [install,setInstall] = useState(null), [expanded,setExpanded] = useState(false);
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let live = true, running = false, rerun = false;
    const refresh = async () => { const [q,s] = await Promise.all([queueItems(userId), readCache(userId,'/api/offline-snapshot')]); if(live){setItems(q);setSaved(s?.savedAt);} };
    const sync = async () => {
      if(running || !navigator.onLine) return;
      running=true;setBusy(true);setError('');
      try{await syncOffline();await prepareOffline();}catch(e){if(live)setError(e.message);}finally{running=false;if(live){setBusy(false);refresh().catch(()=>{});if(rerun&&navigator.onLine){rerun=false;queueMicrotask(sync);}}}
    };
    const connectivity = () => { setOnline(navigator.onLine); if(navigator.onLine){if(running)rerun=true;else sync();} };
    const offer = e => { e.preventDefault();setInstall(e); };
    refresh().catch(()=>{});sync();
    const timer = setInterval(sync,60000);
    const retry = setInterval(async()=>{if(live&&navigator.onLine&&(await queueItems(userId)).length)sync();},5000);
    const reachable=e=>setOnline(navigator.onLine&&e.detail);
    window.addEventListener('partcast:connection',reachable);
    window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
    window.addEventListener('partcast:offline',refresh);window.addEventListener('beforeinstallprompt',offer);
    return () => {live=false;clearInterval(timer);clearInterval(retry);window.removeEventListener('partcast:connection',reachable);window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);window.removeEventListener('partcast:offline',refresh);window.removeEventListener('beforeinstallprompt',offer);};
  },[userId]);
  const conflict = items.find(i=>i.status==='conflict');
  return <section className={`border-b px-4 py-3 sm:px-6 lg:px-8 ${!online?'border-amber-200 bg-amber-50':'border-slate-200 bg-white'}`} aria-label="Connection and sync status">
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {online?<CloudCheck size={17} className="text-emerald-600"/>:<CloudOff size={17} className="text-amber-700"/>}
      <span className="font-semibold">{busy?'Saving changes…':!online?'Working offline':items.length?'Changes waiting to send':'Connected'}</span>
      <span className="text-slate-500">{items.length?`${items.length} unsent transaction${items.length===1?'':'s'}`:saved?`Inventory saved ${new Date(saved).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Preparing offline inventory…'}</span>
      <div className="ml-auto flex gap-2">
        {items.length>0&&<button className="underline underline-offset-4" onClick={()=>setExpanded(!expanded)}>Review changes</button>}
        <button className="inline-flex items-center gap-1 font-semibold" disabled={!navigator.onLine||busy} onClick={async()=>{setBusy(true);setError('');try{await syncOffline();}catch(e){setError(e.message);}finally{setBusy(false);}}}><RefreshCw size={14}/>Sync now</button>
        {install&&<button className="inline-flex items-center gap-1 font-semibold text-red-700" onClick={async()=>{await install.prompt();setInstall(null);}}><Download size={14}/>Install app</button>}
      </div>
    </div>
    {!online&&<p className="mt-2 text-xs text-amber-800">View saved inventory and record sales or stock changes. They will send automatically when connected. Other changes need internet. Offline access lasts up to 12 hours after verification.</p>}
    {(error||conflict)&&<p role="alert" className="mt-2 flex items-start gap-2 text-xs text-red-700"><AlertTriangle size={14}/>{conflict?'A stock change needs review. Later changes are paused until you resolve it.':error}</p>}
    {expanded&&<ul className="mt-3 space-y-2">{items.map(i=><li key={i.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-xs"><span>{i.payload.tx_type.replace('_',' ')} · {i.payload.quantity} units · {i.payload.reference_no||'No reference'} · {new Date(i.createdAt).toLocaleString()}</span><span className="text-red-700">{i.error||'Waiting to sync'}</span>{i.status==='conflict'&&<button className="ml-auto font-semibold underline" onClick={async()=>{if(window.confirm('Remove this rejected transaction from the device? It has not been applied to the database.')){await removeQueued(i.key);setError('');syncOffline().catch(e=>setError(e.message));}}}>Remove rejected change</button>}</li>)}</ul>}
  </section>;
}
