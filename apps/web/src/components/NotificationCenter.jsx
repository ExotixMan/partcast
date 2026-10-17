import {t,useLocale} from '../context/LocaleContext.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Bell,Check,CheckCircle2,PackageX,AlertTriangle,RefreshCw,Search} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
import {api} from '../lib/api.js';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';

export default function NotificationCenter(){
  const {language}=useLocale(),{profile}=useAuth();
  const request=useRef(0),live=useRef(true),pending=useRef(false),refreshPending=useRef(false);
  const [marking,setMarking]=useState(''),[rows,setRows]=useState([]),[open,setOpen]=useState(false);
  const [error,setError]=useState(''),[offline,setOffline]=useState(false),[loading,setLoading]=useState(true);
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState('');
  const locale=language==='fil'?'fil-PH':'en-PH';
  const load=async()=>{
    if(pending.current){refreshPending.current=true;return;}
    const n=++request.current;setLoading(true);
    try{const result=await api.get('/api/notifications');if(live.current&&n===request.current){setRows(Array.isArray(result.data)?result.data:[]);setOffline(Boolean(result.offline));setError('');}}
    catch(cause){if(live.current&&n===request.current)setError(cause.message);}
    finally{if(live.current&&n===request.current)setLoading(false);}
  };
  useEffect(()=>{live.current=true;load();const timer=setInterval(load,60000);window.addEventListener('online',load);window.addEventListener('partcast:queue',load);return()=>{live.current=false;request.current++;clearInterval(timer);window.removeEventListener('online',load);window.removeEventListener('partcast:queue',load);};},[]);
  async function mark(row){
    if(pending.current)return;
    pending.current=true;setMarking(row.id);request.current++;
    try{await api.post(`/api/notifications/${row.id}/read`,{});if(live.current){setRows(current=>current.map(item=>item.id===row.id?{...item,read:true}:item));setError('');}}
    catch(cause){if(live.current)setError(cause.message);}
    finally{pending.current=false;if(live.current){setMarking('');setLoading(false);if(refreshPending.current){refreshPending.current=false;load();}}}
  }
  const count=rows.filter(row=>!row.read).length,out=rows.filter(row=>row.kind==='out').length;
  const visible=useMemo(()=>{
    const search=query.trim().toLowerCase();
    return rows.filter(row=>(filter==='all'||filter==='unread'&&!row.read||filter===row.kind)&&`${row.product?.description||row.title||''} ${row.product?.part_number||''}`.toLowerCase().includes(search))
      .sort((a,b)=>Number(b.kind==='out')-Number(a.kind==='out')||Number(a.read)-Number(b.read)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  },[rows,filter,query]);
  const date=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value)):t('Date unavailable');
  const quantity=value=>value===null||value===undefined?t('Not recorded'):Number(value).toLocaleString(locale,{maximumFractionDigits:2});
  return <>
    <button aria-label={t('Stock notifications{v0}',{v0:count?t(', {v0} unread',{v0:count}):''})} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);load();}} className="relative inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Bell size={20}/><span className="hidden sm:inline">{t('Alerts')}</span>{count>0&&<span className="absolute -right-1 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{count>99?'99+':count}</span>}</button>
    <Modal open={open} onClose={()=>setOpen(false)} title={t('Stock notifications')} description={t('Check urgent stock needs first, then decide what to receive or order.')} size="lg" footer={<><button className="btn-secondary" disabled={loading||Boolean(marking)} onClick={load}><RefreshCw size={17} className={loading?'animate-spin':''}/>{t('Check alerts again')}</button><Link className="btn-primary" to={profile?.role==='cashier'?'/inventory':'/reorder'} onClick={()=>setOpen(false)}>{profile?.role==='cashier'?t('View inventory'):t('Review restocking')}</Link></>}>
      {offline&&<p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{t('These are saved alerts. Connect to check for new ones.')}</p>}
      {error&&<div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{t(error)}</div>}
      {loading&&!rows.length?<Loading label={t('Checking stock alerts…')}/>:<>
        {rows.length>0&&<>
          <dl className="mb-5 grid grid-cols-3 gap-2"><div className="rounded-xl border border-red-100 bg-red-50 p-3"><dt className="text-xs font-medium text-red-700">{t('Out of stock')}</dt><dd className="mt-1 text-2xl font-bold text-red-700">{out}</dd></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><dt className="text-xs font-medium text-amber-900">{t('Running low')}</dt><dd className="mt-1 text-2xl font-bold text-amber-900">{rows.length-out}</dd></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium text-slate-600">{t('Unread')}</dt><dd className="mt-1 text-2xl font-bold text-slate-900">{count}</dd></div></dl>
          <label className="mb-3 block"><span className="label">{t('Find a stock alert')}</span><div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-4 text-slate-400"/><input className="input pl-10" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('Part number or name')}/></div></label>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('Filter stock alerts')}>{[['all','All alerts'],['unread','Unread'],['out','Out of stock'],['low','Running low']].map(([key,label])=><button key={key} aria-pressed={filter===key} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${filter===key?'border-red-200 bg-red-50 text-red-700':'border-slate-200 bg-white text-slate-600'}`} onClick={()=>setFilter(key)}>{t(label)}</button>)}</div>
        </>}
        {visible.length?<div className="space-y-3">{visible.map(row=><article key={row.id} className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 bg-white p-4 ${row.kind==='out'?'border-l-red-600':'border-l-amber-500'}`}>
          <div className="flex items-start gap-3"><span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${row.kind==='out'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700'}`}>{row.kind==='out'?<PackageX size={21}/>:<AlertTriangle size={21}/>}</span><div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words text-xs font-semibold text-slate-500">{row.product?.part_number||t('No part number')}</p><span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.read?'text-slate-500':'text-red-700'}`}>{row.read?<><Check size={14}/>{t('Read')}</>:t('New alert')}</span></div>
            <h3 className="mt-1 break-words font-bold text-slate-900">{row.product?.description?t(row.kind==='out'?'Out of stock: {v0}':'Running low: {v0}',{v0:row.product.description}):t(row.title)}</h3>
            {row.product?<dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3"><div><dt className="text-xs text-slate-500">{t('Available stock')}</dt><dd className="mt-1 font-semibold text-slate-900">{quantity(row.product.current_stock)} <span className="text-xs font-normal">{row.product.unit||t('units')}</span></dd></div><div><dt className="text-xs text-slate-500">{t('Low-stock level')}</dt><dd className="mt-1 font-semibold text-slate-900">{quantity(row.product.minimum_stock)}</dd></div></dl>:<p className="mt-2 text-sm leading-6 text-slate-700">{t(row.message)}</p>}
            <p className="mt-3 text-xs text-slate-500">{date(row.created_at)}</p>
            {!row.read&&<button className="btn-secondary mt-3" disabled={offline||Boolean(marking)} onClick={()=>mark(row)}>{marking===row.id?t('Saving…'):t('Mark as read')}</button>}
          </div></div>
        </article>)}</div>:rows.length?<div className="rounded-xl bg-slate-50 p-6 text-center"><p className="font-semibold text-slate-900">{t('No alerts match this view.')}</p><button className="btn-secondary mt-3" onClick={()=>{setQuery('');setFilter('all');}}>{t('Show all alerts')}</button></div>:!error&&<div className="py-8 text-center"><CheckCircle2 size={36} className="mx-auto text-emerald-600"/><h3 className="mt-3 font-semibold text-slate-900">{t('No stock alerts to show')}</h3><p className="mt-2 text-sm text-slate-600">{t('Low-stock and out-of-stock alerts appear here.')}</p></div>}
        {!!rows.length&&<p className="mt-4 text-xs leading-5 text-slate-500">{t('Marking an alert as read clears its new badge. The stock issue remains until the stock is corrected or replenished.')}</p>}
      </>}
    </Modal>
  </>;
}
