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
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{setBusy(true);setError('');try{setData(await api.get('/api/dashboard'));}catch(e){setError(e.message);}finally{setBusy(false);}};
 useEffect(()=>{load();},[]);
 if(!data&&!error)return <Loading label="Loading dashboard..."/>;
 return <>
  <PageHeader title="Dashboard" subtitle="Live inventory condition, sales movement, and forecast-based replenishment." actions={<button className="btn-secondary" onClick={load} disabled={busy}><RefreshCw size={16} className={busy?'animate-spin':''}/>Refresh</button>}/>
  {error&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
  {data&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Active products" value={Number(data.metrics.totalProducts||0).toLocaleString()} icon={Boxes}/>
    <StatCard label="Low stock" value={Number(data.metrics.lowStock||0).toLocaleString()} icon={AlertTriangle} tone="amber" note="At or below minimum level"/>
    <StatCard label="Out of stock" value={Number(data.metrics.outOfStock||0).toLocaleString()} icon={PackageX} tone="red"/>
    <StatCard label="Inventory value" value={peso(data.metrics.inventoryValue)} icon={CircleDollarSign} tone="emerald" note="Based on recorded unit cost"/>
   </div>
   <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.85fr]">
    <section className="panel overflow-hidden">
     <div className="panel-header"><div><h2 className="font-bold text-slate-900">30-day sales trend</h2><p className="text-sm text-slate-500">Recorded transaction revenue plus imported legacy sales.</p></div></div>
     <div className="h-72 p-3 sm:p-5"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.salesTrend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day" tick={{fontSize:11}} tickFormatter={v=>String(v).slice(5)}/><YAxis tick={{fontSize:11}} width={60}/><Tooltip formatter={(v,n)=>n==='revenue'?peso(v):v}/><Line type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div>
    </section>
    <section className="panel overflow-hidden">
     <div className="panel-header"><div><h2 className="font-bold text-slate-900">Replenishment priorities</h2><p className="text-sm text-slate-500">Latest forecast and stock position.</p></div></div>
     <div className="divide-y divide-slate-100">{data.reorder.length?data.reorder.map(r=><div key={r.product_id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{r.part_number||'No part number'} · {r.description}</p><p className="mt-0.5 text-xs text-slate-500">On hand {Number(r.current_stock)} · Suggested {Math.ceil(Number(r.recommended_quantity))}</p></div><StatusBadge status={r.status}/></div>):<p className="px-5 py-10 text-center text-sm text-slate-500">No current reorder recommendations.</p>}</div>
    </section>
   </div>
   <div className="mt-5 grid gap-5 lg:grid-cols-2">
    {[['Fast-moving products',data.fastMoving],['Slow-moving products',data.slowMoving]].map(([title,rows])=><section key={title} className="panel overflow-hidden"><div className="panel-header"><h2 className="font-bold text-slate-900">{title}</h2><span className="text-xs text-slate-500">Last 90 days</span></div><div className="divide-y divide-slate-100">{rows.map((r,i)=><div key={r.product_id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{i+1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{r.part_number||'N/A'} · {r.description}</p></div><span className="text-sm font-semibold text-slate-700">{Number(r.quantity||0).toFixed(0)} sold</span></div>)}</div></section>)}
   </div>
   {data.latestForecastRun&&<div className="mt-5 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">Latest XGBoost run: <span className="font-semibold text-slate-900">{new Date(data.latestForecastRun.completed_at).toLocaleString()}</span> · {data.latestForecastRun.training_rows} training rows · {data.latestForecastRun.horizon_days}-day horizon.</div>}
  </>}
 </>;
}
