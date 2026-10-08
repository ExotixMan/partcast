import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useEffect, useState } from 'react';
import { AlertTriangle, Boxes, CircleDollarSign, PackageX, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import Loading from '../components/Loading.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const peso=v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(Number(v||0));

export default function DashboardPage(){
 const {profile}=useAuth();
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{setBusy(true);setError('');try{setData(await api.get('/api/dashboard'));}catch(e){setError(e.message);}finally{setBusy(false);}};
 useEffect(()=>{load();},[]);
 if(!data&&!error)return <Loading label="Loading dashboard..."/>;
 return <>
  <PageHeader title={`Hello, ${profile?.full_name?.split(' ')[0]||'welcome'}`} subtitle="Here is how your store is doing. Choose an action to get started." actions={<button className="btn-secondary" onClick={load} disabled={busy}><RefreshCw size={16} className={busy?'animate-spin':''}/>Refresh</button>}/>
  <section aria-label="Common actions" className="mb-6 grid gap-3 sm:grid-cols-3">{[
    ['/inventory?action=sale','Record a sale','Find a part, choose Sell, and enter the quantity.'],
    ['/inventory?action=stock_in','Receive stock','Find a part and add the quantity delivered.'],
    ['/reorder','Check parts to restock','Review low stock and suggested order quantities.']
  ].map(([to,title,text],i)=><Link key={to} to={to} className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-red-400"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-sm font-bold text-red-700">{i+1}</span><div><h2 className="text-sm font-bold">{title}<span aria-hidden="true" className="ml-2 text-red-600">→</span></h2><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></Link>)}</section>
  {data?.offline&&<p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Saved store overview from {new Date(data.savedAt).toLocaleString()}. Unsent stock changes are shown on Inventory; totals here update after syncing.</p>}
  {error&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
  {data&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Parts in inventory" value={Number(data.metrics.totalProducts||0).toLocaleString()} icon={Boxes}/>
    <StatCard label="Low stock" value={Number(data.metrics.lowStock||0).toLocaleString()} icon={AlertTriangle} tone="amber" note="At or below minimum level"/>
    <StatCard label="Out of stock" value={Number(data.metrics.outOfStock||0).toLocaleString()} icon={PackageX} tone="red"/>
    <StatCard label="Inventory value" value={peso(data.metrics.inventoryValue)} icon={CircleDollarSign} tone="emerald" note="Based on recorded unit cost"/>
   </div>
   <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.85fr]">
    <section className="panel overflow-hidden">
     <div className="panel-header"><div><h2 className="font-bold text-slate-900">30-day sales trend</h2><p className="text-sm text-slate-500">Sales recorded over the last 30 days.</p></div></div>
     <div className="h-72 p-3 sm:p-5"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.salesTrend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day" tick={{fontSize:11}} tickFormatter={v=>String(v).slice(5)}/><YAxis tick={{fontSize:11}} width={60}/><Tooltip formatter={(v,n)=>n==='revenue'?peso(v):v}/><Line type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div>
    </section>
    <section className="panel overflow-hidden">
     <div className="panel-header"><div><h2 className="font-bold text-slate-900">Parts to restock</h2><p className="text-sm text-slate-500">Review these parts before placing an order.</p></div></div>
     <div className="divide-y divide-slate-100">{data.reorder.length?data.reorder.map(r=><div key={r.product_id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{r.part_number||'No part number'} · {r.description}</p><p className="mt-0.5 text-xs text-slate-500">On hand {Number(r.current_stock)} · Suggested {Math.ceil(Number(r.recommended_quantity))}</p></div><StatusBadge status={r.status}/></div>):<p className="px-5 py-10 text-center text-sm text-slate-500">No current reorder recommendations.</p>}</div>
    </section>
   </div>
   <div className="mt-5 grid gap-5 lg:grid-cols-2">
    {[['Best-selling parts',data.fastMoving],['Parts selling less often',data.slowMoving]].map(([title,rows])=><section key={title} className="panel overflow-hidden"><div className="panel-header"><h2 className="font-bold text-slate-900">{title}</h2><span className="text-xs text-slate-500">Last 90 days</span></div><div className="divide-y divide-slate-100">{rows.map((r,i)=><div key={r.product_id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{i+1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{r.part_number||'N/A'} · {r.description}</p></div><span className="text-sm font-semibold text-slate-700">{Number(r.quantity||0).toFixed(0)} sold</span></div>)}</div></section>)}
   </div>
   {data.latestForecastRun&&<div className="mt-5 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">Demand estimate last updated: <span className="font-semibold text-slate-900">{new Date(data.latestForecastRun.completed_at).toLocaleString()}</span> · {data.latestForecastRun.training_rows} past observations · {data.latestForecastRun.horizon_days}-day planning period.</div>}
  </>}
 </>;
}
