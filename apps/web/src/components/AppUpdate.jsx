import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from '../context/AuthContext.jsx';
import { queueItems } from '../lib/offline.js';
export default function AppUpdate(){
 const {session}=useAuth();
 const {needRefresh:[needed,setNeeded],updateServiceWorker}=useRegisterSW();
 if(!needed)return null;
 return <div role="status" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 mx-auto flex max-w-lg flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-white p-4 text-sm text-slate-800 shadow-xl"><span className="flex-1">A new version of PartCast is ready.</span><button className="btn-primary" onClick={async()=>{if(session&&(await queueItems(session.user.id)).length){window.alert('Send your waiting stock changes before updating the app.');return;}updateServiceWorker(true);}}>Update app</button><button className="btn-secondary" onClick={()=>setNeeded(false)}>Later</button></div>;
}
