import {t,useLocale} from '../context/LocaleContext.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Bell,BellDot,Boxes,Check,CheckCircle2,ChevronDown,CloudOff,Info,ListFilter,PackageSearch,PackageX,AlertTriangle,RefreshCw,Search,Truck} from 'lucide-react';
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
  const filters = [
    {key:'all',label:'All alerts',icon:ListFilter,count:rows.length},
    {key:'out',label:'Out of stock',icon:PackageX,count:out},
    {key:'low',label:'Running low',icon:AlertTriangle,count:rows.length-out},
    {key:'unread',label:'Unread',icon:BellDot,count}
  ];
  return <>
    <button aria-label={t('Stock notifications{v0}',{v0:count?t(', {v0} unread',{v0:count}):''})} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);load();}} className="relative inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
      <Bell size={20} aria-hidden="true"/><span className="hidden sm:inline">{t('Alerts')}</span>{count>0&&<span className="absolute -right-1 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white" aria-hidden="true">{count>99?'99+':count}</span>}
    </button>
    <Modal open={open} onClose={()=>setOpen(false)} title={t('Stock notifications')} size="lg" footer={<div className="flex w-full items-center gap-2 sm:justify-end">
      <button className="btn-secondary shrink-0" aria-label={t('Check alerts again')} title={t('Check alerts again')} disabled={loading||Boolean(marking)} onClick={load}><RefreshCw size={20} aria-hidden="true" className={loading?'animate-spin':''}/><span className="hidden sm:inline">{t('Check alerts again')}</span></button>
      <Link className="btn-primary min-w-0 flex-1 sm:flex-none" to={profile?.role==='cashier'?'/inventory':'/reorder'} onClick={()=>setOpen(false)}>{profile?.role==='cashier'?<PackageSearch size={20} className="shrink-0" aria-hidden="true"/>:<Truck size={20} className="shrink-0" aria-hidden="true"/>}{profile?.role==='cashier'?t('View inventory'):t('Review restocking')}</Link>
    </div>}>
      {offline&&<div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"><CloudOff size={20} className="mt-0.5 shrink-0" aria-hidden="true"/><p>{t('These are saved alerts. Connect to check for new ones.')}</p></div>}
      {error&&<div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true"/><p>{t(error)}</p></div>}
      {loading&&!rows.length?<Loading label={t('Checking stock alerts…')}/>:<>
        {rows.length>0&&<>
          <div className="notification-filters mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('Filter stock alerts')}>
            {filters.map(({key,label,icon:Icon,count:total})=><button key={key} type="button" aria-label={t(label)} aria-pressed={filter===key} className={`flex min-h-20 min-w-0 flex-col gap-2 rounded-xl border p-3 text-left text-sm font-semibold ${filter===key?'border-red-300 bg-red-50 text-red-800':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`} onClick={()=>setFilter(key)}>
              <span className="flex w-full items-center justify-between gap-2"><Icon size={22} className="shrink-0" aria-hidden="true"/><span className="text-base font-bold" aria-hidden="true">{total}</span></span>
              <span className="w-full min-w-0 break-words leading-snug">{t(label)}</span>
            </button>)}
          </div>
          <label className="mb-4 block"><span className="label">{t('Find a stock alert')}</span><div className="relative"><Search size={19} className="pointer-events-none absolute left-3 top-4 text-slate-500" aria-hidden="true"/><input className="input pl-10" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('Part number or name')}/></div></label>
        </>}
        {visible.length?<div className="space-y-3">{visible.map(row=>{
          const status=t(row.kind==='out'?'Out of stock':'Running low');
          const name=row.product?.description||t(row.title);
          const StatusIcon=row.kind==='out'?PackageX:AlertTriangle;
          const tone=row.kind==='out'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-800';
          return <article key={row.id} aria-label={`${status}: ${name}`} className="stock-alert-card min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><StatusIcon size={23} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span><span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.read?'text-slate-500':'text-red-700'}`}>{row.read?<><Check size={15} aria-hidden="true"/>{t('Read')}</>:<><BellDot size={15} aria-hidden="true"/>{t('New alert')}</>}</span></div>
                <h3 className="mt-2 break-words text-base font-bold leading-snug text-slate-900">{name}</h3>
                <p className="mt-1 break-all text-sm text-slate-500">{row.product?.part_number||t('No part number')}</p>
              </div>
            </div>
            {row.product?<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2"><Boxes size={19} className="shrink-0 text-slate-500" aria-hidden="true"/><p className="min-w-0 text-sm text-slate-600">{t('Available stock')}<strong className="ml-2 break-words text-base text-slate-900">{quantity(row.product.current_stock)} {row.product.unit||t('units')}</strong></p></div>
              {!row.read&&<button type="button" className="btn-secondary max-w-full px-3 py-2 text-sm" disabled={offline||Boolean(marking)} onClick={()=>mark(row)}><CheckCircle2 size={18} className="shrink-0" aria-hidden="true"/>{marking===row.id?t('Saving…'):t('Mark as read')}</button>}
            </div>:<><p className="mt-3 text-sm leading-6 text-slate-700">{t(row.message)}</p>{!row.read&&<button type="button" className="btn-secondary mt-3 max-w-full" disabled={offline||Boolean(marking)} onClick={()=>mark(row)}><CheckCircle2 size={18} className="shrink-0" aria-hidden="true"/>{marking===row.id?t('Saving…'):t('Mark as read')}</button>}</>}
            <details className="group mt-2">
              <summary className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><Info size={17} className="shrink-0" aria-hidden="true"/><span>{t('Alert details')}</span><ChevronDown size={17} className="ml-auto shrink-0 group-open:rotate-180" aria-hidden="true"/></summary>
              <div className="mt-1 space-y-3 rounded-xl border border-slate-200 p-3">
                <dl className="space-y-2 text-sm">{row.product&&<div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-slate-500">{t('Low-stock level')}</dt><dd className="font-semibold text-slate-900">{quantity(row.product.minimum_stock)}</dd></div>}<div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-slate-500">{t('Alert date')}</dt><dd className="text-slate-700">{date(row.created_at)}</dd></div></dl>
              </div>
            </details>
          </article>;
        })}</div>:rows.length?<div className="rounded-xl bg-slate-50 p-6 text-center"><Search size={28} className="mx-auto text-slate-400" aria-hidden="true"/><p className="mt-3 font-semibold text-slate-900">{t('No alerts match this view.')}</p><button type="button" className="btn-secondary mt-3" onClick={()=>{setQuery('');setFilter('all');}}>{t('Show all alerts')}</button></div>:!error&&<div className="py-8 text-center"><CheckCircle2 size={36} className="mx-auto text-emerald-600" aria-hidden="true"/><h3 className="mt-3 font-semibold text-slate-900">{t('No stock alerts to show')}</h3></div>}
      </>}
    </Modal>
  </>;
}
