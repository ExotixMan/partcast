import { Boxes, Download, FileSpreadsheet, History, Truck } from 'lucide-react';
import { api } from '../lib/api.js';
import PageHeader from '../components/PageHeader.jsx';
import Toast from '../components/Toast.jsx';
import { useState } from 'react';

const reports=[
 {type:'inventory',title:'Inventory report',text:'Current quantity, minimum and safety stock, location, cost, and selling price.',icon:Boxes},
 {type:'transactions',title:'Transaction report',text:'Stock-in, stock-out, sales, references, suppliers, customers, and quantities.',icon:History},
 {type:'reorder',title:'Reorder report',text:'Forecast demand, suggested reorder quantity, supplier, email, and estimated cost.',icon:Truck}
];
export default function ReportsPage(){const [busy,setBusy]=useState(''),[toast,setToast]=useState(null);async function dl(type){setBusy(type);try{await api.download(`/api/reports/${type}.xlsx`);}catch(e){setToast({type:'error',message:e.message});}finally{setBusy('');}}return <><PageHeader title="Reports" subtitle="Generate operational Excel reports directly from live PartCast data."/><div className="grid gap-4 lg:grid-cols-3">{reports.map(r=><article className="panel p-5" key={r.type}><div className="flex items-start justify-between"><div className="rounded-xl bg-slate-100 p-3 text-slate-700"><r.icon size={21}/></div><FileSpreadsheet size={20} className="text-emerald-600"/></div><h2 className="mt-5 font-bold text-slate-900">{r.title}</h2><p className="mt-2 min-h-16 text-sm leading-6 text-slate-500">{r.text}</p><button className="btn-primary mt-5 w-full" disabled={busy===r.type} onClick={()=>dl(r.type)}><Download size={16}/>{busy===r.type?'Generating...':'Download Excel'}</button></article>)}</div><Toast toast={toast} onClose={()=>setToast(null)}/></>}
