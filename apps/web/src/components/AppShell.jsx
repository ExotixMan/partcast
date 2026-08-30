import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, Boxes, BrainCircuit, ChevronRight, FileDown, History, LogOut,
  Menu, RefreshCcw, Settings, ShieldCheck, Truck, Upload, UserCog, Users, X
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import AssistantChat from './AssistantChat.jsx';

const nav = [
  { to:'/', label:'Dashboard', icon:BarChart3, end:true },
  { to:'/inventory', label:'Inventory', icon:Boxes },
  { to:'/transactions', label:'Transactions', icon:History },
  { to:'/forecast', label:'Demand Forecast', icon:BrainCircuit },
  { to:'/reorder', label:'Reorder & Suppliers', icon:Truck },
  { to:'/reports', label:'Reports', icon:FileDown },
  { to:'/account', label:'My Account', icon:UserCog },
  { to:'/imports', label:'Import Data', icon:Upload, admin:true },
  { to:'/backups', label:'Backups', icon:RefreshCcw, admin:true },
  { to:'/users', label:'Users & Security', icon:Users, owner:true },
  { to:'/settings', label:'Settings', icon:Settings, owner:true }
];

function SidebarContent({ close }) {
  const { profile, signOut } = useAuth();
  const allowed = nav.filter(n => !n.owner || profile?.role === 'owner').filter(n => !n.admin || ['owner','admin'].includes(profile?.role));
  return <>
    <div className="flex h-20 items-center border-b border-white/10 px-4">
      <img src="/npg-logo.png" alt="NPG Autoparts" className="h-14 w-full object-contain object-left" />
    </div>
    <div className="px-4 pb-2 pt-5">
      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-400">PartCast</p>
        <p className="mt-1 text-sm font-semibold text-white">Inventory & Demand Forecasting</p>
      </div>
    </div>
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
      {allowed.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={close} className={({isActive})=>`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive?'bg-red-600 text-white':'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
        <item.icon size={18} strokeWidth={1.9}/><span>{item.label}</span><ChevronRight size={15} className="ml-auto opacity-0 transition group-hover:opacity-60"/>
      </NavLink>)}
    </nav>
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">{(profile?.full_name||'U').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div>
        <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{profile?.full_name}</p><p className="capitalize text-xs text-slate-400">{profile?.role?.replace('_',' ')}</p></div>
      </div>
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"><LogOut size={18}/> Sign out</button>
    </div>
  </>;
}

export default function AppShell() {
  const [open,setOpen]=useState(false);
  const location=useLocation();
  const current = nav.find(n => n.to==='/' ? location.pathname==='/' : location.pathname.startsWith(n.to));
  return <div className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#050505] lg:flex"><SidebarContent/></aside>
    {open && <div className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" onClick={()=>setOpen(false)}>
      <aside className="flex h-full w-[86vw] max-w-72 flex-col bg-[#050505]" onClick={e=>e.stopPropagation()}>
        <button className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white" onClick={()=>setOpen(false)}><X size={18}/></button><SidebarContent close={()=>setOpen(false)}/>
      </aside>
    </div>}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden" onClick={()=>setOpen(true)}><Menu size={20}/></button>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{current?.label || 'PartCast'}</p><p className="hidden text-xs text-slate-500 sm:block">NPG Autoparts · Toyota Specialist</p></div>
        <div className="ml-auto flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck size={15}/> Secure session</div>
      </header>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8"><Outlet/></main>
    </div>
    <AssistantChat/>
  </div>;
}
