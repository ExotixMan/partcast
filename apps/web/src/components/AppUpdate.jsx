import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from '../context/AuthContext.jsx';
import { queueItems } from '../lib/offline.js';
export default function AppUpdate(){
 const {session}=useAuth();
 const {needRefresh:[needed,setNeeded],updateServiceWorker}=useRegisterSW();
 if(!needed)return null;
 return <div role="status" className="fixed bottom-20 left-4 right-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 p-4 text-sm text-white shadow-xl"><span>A new version is available.</span><button className="font-semibold underline" onClick={async()=>{if(session&&(await queueItems(session.user.id)).length){window.alert('Sync your waiting stock changes before updating the app.');return;}updateServiceWorker(true);}}>Update</button><button className="text-xs" onClick={()=>setNeeded(false)}>Later</button></div>;
}
