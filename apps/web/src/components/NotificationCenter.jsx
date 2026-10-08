import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, PackageX, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';

export default function NotificationCenter(){
  const [rows,setRows]=useState([]),[open,setOpen]=useState(false),[error,setError]=useState(''),[offline,setOffline]=useState(false),[loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);try{const result=await api.get('/api/notifications');setRows(result.data||[]);setOffline(Boolean(result.offline));setError('');}catch(e){setError(e.message);}finally{setLoading(false);}};
  useEffect(()=>{let live=true;const refresh=async()=>{try{const result=await api.get('/api/notifications');if(live){setRows(result.data||[]);setOffline(Boolean(result.offline));setError('');}}catch(e){if(live)setError(e.message);}finally{if(live)setLoading(false);}};refresh();const timer=setInterval(refresh,60000);window.addEventListener('online',refresh);return()=>{live=false;clearInterval(timer);window.removeEventListener('online',refresh);};},[]);
  async function mark(row){try{await api.post(`/api/notifications/${row.id}/read`,{});setRows(current=>current.map(r=>r.id===row.id?{...r,read:true}:r));setError('');}catch(e){setError(e.message);}}
  const count=rows.filter(r=>!r.read).length;
  return <>
    <button aria-label={`Stock notifications${count?`, ${count} unread`:''}`} aria-haspopup="dialog" onClick={()=>setOpen(true)} className="relative inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Bell size={20}/><span>Alerts</span>{count>0&&<span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{count>99?'99+':count}</span>}</button>
    <Modal open={open} onClose={()=>setOpen(false)} title="Stock notifications" description={offline?'These are saved alerts. Connect to check for new ones.':'Check parts running low and decide what to order.'} size="md">
      {error&&<div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><p>{error}</p><button className="btn-secondary mt-3" onClick={load} disabled={loading}>Check alerts again</button></div>}
      {loading&&!rows.length?<Loading label="Checking stock alerts…"/>:rows.length?<div className="space-y-3">{rows.map(r=><article key={r.id} className={`rounded-xl border p-4 ${r.read?'border-slate-200 bg-white':'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3">{r.kind==='out'?<PackageX className="mt-1 shrink-0 text-red-700" size={22}/>:<AlertTriangle className="mt-1 shrink-0 text-amber-700" size={22}/>}<div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{r.title}</h3><p className="mt-1 text-sm leading-6 text-slate-700">{r.message}</p><p className="mt-2 text-xs text-slate-600">{new Date(r.created_at).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary" to="/reorder" onClick={()=>setOpen(false)}>Review restocking</Link>{!r.read&&<button className="btn-secondary" disabled={offline} onClick={()=>mark(r)}>Mark as read</button>}</div></div></div></article>)}</div>:!error&&<div className="py-8 text-center"><CheckCircle2 size={32} className="mx-auto text-slate-400"/><h3 className="mt-3 font-semibold text-slate-900">No stock alerts to show</h3><p className="mt-2 text-sm text-slate-600">Low-stock and out-of-stock alerts appear here.</p></div>}
    </Modal>
  </>;
}
