import {t,useLocale} from '../context/LocaleContext.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Bell,BellDot,Check,CheckCircle2,CloudOff,Copy,ListFilter,PackageSearch,PackageX,AlertTriangle,RefreshCw,Search,Truck} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
import {api} from '../lib/api.js';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';
import './notifications.css';

export default function NotificationCenter(){
  const {language}=useLocale(),{profile}=useAuth();
  const request=useRef(0),live=useRef(true),pending=useRef(false),refreshPending=useRef(false);
  const [marking,setMarking]=useState(''),[rows,setRows]=useState([]),[open,setOpen]=useState(false);
  const [error,setError]=useState(''),[offline,setOffline]=useState(false),[loading,setLoading]=useState(true);
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState('');
  const [copying,setCopying]=useState(''),[copyFeedback,setCopyFeedback]=useState(null);
  const copyPending=useRef(false);
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
  useEffect(()=>{
    if(!copyFeedback)return;
    const timer=setTimeout(()=>setCopyFeedback(null),4000);
    return()=>clearTimeout(timer);
  },[copyFeedback]);
  async function copySku(row){
    const sku=row.product?.part_number;
    if(!sku||copyPending.current)return;
    copyPending.current=true;setCopying(row.id);setCopyFeedback(null);
    try{
      if(typeof navigator.clipboard?.writeText!=='function')throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(String(sku));
      if(live.current)setCopyFeedback({id:row.id,failed:false});
    }catch{
      if(live.current)setCopyFeedback({id:row.id,failed:true});
    }finally{
      copyPending.current=false;
      if(live.current)setCopying('');
    }
  }
  const count=rows.filter(row=>!row.read).length,out=rows.filter(row=>row.kind==='out').length;
  const visible=useMemo(()=>{
    const search=query.trim().toLowerCase();
    return rows.filter(row=>(filter==='all'||filter==='unread'&&!row.read||filter===row.kind)&&`${row.product?.description||row.title||''} ${row.product?.part_number||''}`.toLowerCase().includes(search))
      .sort((a,b)=>Number(b.kind==='out')-Number(a.kind==='out')||Number(a.read)-Number(b.read)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  },[rows,filter,query]);
  const date=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value)):t('Date unavailable');
  const quantity=value=>value===null||value===undefined||!Number.isFinite(Number(value))?t('Not recorded'):Number(value).toLocaleString(locale,{maximumFractionDigits:2});
  const relativeDate=value=>{
    const timestamp=Date.parse(value);
    if(!Number.isFinite(timestamp))return t('Date unavailable');
    const seconds=(timestamp-Date.now())/1000,elapsed=Math.abs(seconds);
    const [unit,divisor]=elapsed>=31536000?['year',31536000]:elapsed>=2592000?['month',2592000]:elapsed>=86400?['day',86400]:elapsed>=3600?['hour',3600]:elapsed>=60?['minute',60]:['second',1];
    return new Intl.RelativeTimeFormat(locale,{numeric:'auto',style:'short'}).format(Math.trunc(seconds/divisor),unit);
  };
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
          <div className="notification-filters mb-4" role="group" aria-label={t('Filter stock alerts')}>
            {filters.map(({key,label,icon:Icon,count:total})=><button key={key} type="button" aria-label={t(label)} aria-pressed={filter===key} className={`notification-filter rounded-xl border text-left text-sm font-semibold ${filter===key?'border-red-300 bg-red-50 text-red-800':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`} onClick={()=>setFilter(key)}>
              <span className="notification-filter-label"><Icon size={18} aria-hidden="true"/>{t(label)}</span>
              <span className="shrink-0 text-sm font-bold" aria-hidden="true">{total}</span>
            </button>)}
          </div>
          <label className="mb-4 block"><span className="label">{t('Find a stock alert')}</span><div className="relative"><Search size={19} className="pointer-events-none absolute left-3 top-4 text-slate-500" aria-hidden="true"/><input className="input pl-10" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('Part number or name')}/></div></label>
        </>}
        {visible.length?<div className="space-y-3">{visible.map(row=>{
          const status=t(row.kind==='out'?'Out of stock':'Running low');
          const name=row.product?.description||t(row.title);
          const StatusIcon=row.kind==='out'?PackageX:AlertTriangle;
          const tone=row.kind==='out'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-800';
          const lookup=row.product?.part_number||row.product?.description||'';
          const destination=`/${profile?.role==='cashier'?'inventory':'reorder'}${lookup?`?q=${encodeURIComponent(lookup)}`:''}`;
          const unit=row.product?.unit||t('units');
          const timestamp=Date.parse(row.created_at);
          const feedback=copyFeedback?.id===row.id?copyFeedback:null;
          return <article key={row.id} aria-label={`${status}: ${name}`} className="stock-alert-card min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="notification-card-heading">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><StatusIcon size={23} aria-hidden="true"/></span>
              <div className="min-w-0">
                <div className="notification-name-line"><h3 className="min-w-0 break-words text-base font-bold leading-snug text-slate-900">{name}</h3>{row.read?<span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500"><Check size={15} aria-hidden="true"/>{t('Read')}</span>:<span className="notification-unread-dot"><span className="sr-only">{t('New alert')}</span></span>}</div>
                <p className="mt-1 break-all text-sm text-slate-500"><span className="mr-1 font-semibold">{t('SKU')}</span>{row.product?.part_number||t('No part number')}</p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>
              </div>
              <button type="button" className="notification-copy-button rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label={t('Copy SKU')} title={t('Copy SKU')} disabled={!row.product?.part_number||Boolean(copying)} aria-busy={copying===row.id||undefined} onClick={()=>copySku(row)}>{feedback&&!feedback.failed?<Check size={20} aria-hidden="true"/>:<Copy size={20} aria-hidden="true"/>}</button>
            </div>
            <div className="notification-card-main">
              {feedback&&<p role={feedback.failed?'alert':'status'} className={`mt-2 text-sm ${feedback.failed?'text-red-700':'text-emerald-700'}`}>{feedback.failed?t('Could not copy SKU.'):t('SKU copied.')}</p>}
              {row.product?<dl className="notification-stock-meta text-sm text-slate-600">
                <div><dt>{t('Stock')}:</dt><dd className="font-semibold text-slate-900">{quantity(row.product.current_stock)} {unit}</dd></div>
                <div><dt>{t('Threshold')}:</dt><dd className="font-semibold text-slate-900">{quantity(row.product.minimum_stock)} {unit}</dd></div>
                <div><dt className="sr-only">{t('Alert date')}</dt><dd>{Number.isFinite(timestamp)?<time dateTime={new Date(timestamp).toISOString()} title={date(row.created_at)}>{relativeDate(row.created_at)}</time>:t('Date unavailable')}</dd></div>
              </dl>:<p className="mt-3 text-sm leading-6 text-slate-700">{t(row.message)}</p>}
              <div className="notification-card-actions">
                <Link className="btn-secondary max-w-full px-3 py-2 text-sm" to={destination} onClick={()=>setOpen(false)}>{profile?.role==='cashier'?<PackageSearch size={18} className="shrink-0" aria-hidden="true"/>:<Truck size={18} className="shrink-0" aria-hidden="true"/>}{profile?.role==='cashier'?t('View inventory'):t('Restock')}</Link>
                {!row.read&&<button type="button" className="btn-secondary max-w-full px-3 py-2 text-sm" disabled={offline||Boolean(marking)} onClick={()=>mark(row)}><CheckCircle2 size={18} className="shrink-0" aria-hidden="true"/>{marking===row.id?t('Saving…'):t('Mark as read')}</button>}
              </div>
            </div>
          </article>;
        })}</div>:rows.length?<div className="rounded-xl bg-slate-50 p-6 text-center"><Search size={28} className="mx-auto text-slate-400" aria-hidden="true"/><p className="mt-3 font-semibold text-slate-900">{t('No alerts match this view.')}</p><button type="button" className="btn-secondary mt-3" onClick={()=>{setQuery('');setFilter('all');}}>{t('Show all alerts')}</button></div>:!error&&<div className="py-8 text-center"><CheckCircle2 size={36} className="mx-auto text-emerald-600" aria-hidden="true"/><h3 className="mt-3 font-semibold text-slate-900">{t('No stock alerts to show')}</h3></div>}
      </>}
    </Modal>
  </>;
}
