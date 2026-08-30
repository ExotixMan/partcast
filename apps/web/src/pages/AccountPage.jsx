import { useState } from 'react';
import { KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Toast from '../components/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';

export default function AccountPage(){
 const {profile,session,refreshProfile,signOut}=useAuth();
 const [name,setName]=useState(profile?.full_name||''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(''),[toast,setToast]=useState(null);
 async function saveProfile(){setBusy('profile');try{await api.patch('/api/me',{full_name:name});await refreshProfile();setToast({message:'Profile name updated.'});}catch(e){setToast({type:'error',message:e.message});}finally{setBusy('');}}
 async function changePassword(){
  if(password.length<10){setToast({type:'error',message:'Password must be at least 10 characters.'});return;}
  if(password!==confirm){setToast({type:'error',message:'Password confirmation does not match.'});return;}
  setBusy('password');
  try{
   const {error}=await supabase.auth.updateUser({password});
   if(error)throw error;
   setPassword('');setConfirm('');setToast({message:'Password changed. Sign in again with the new password.'});
   setTimeout(()=>signOut(),1200);
  }catch(e){setToast({type:'error',message:e.message});}finally{setBusy('');}
 }
 return <><PageHeader title="My Account" subtitle="Manage your own profile and authentication password."/>
 <div className="grid gap-5 lg:grid-cols-2">
  <section className="panel p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-slate-100 p-3 text-slate-700"><UserRound size={21}/></div><div><h2 className="font-bold">Profile</h2><p className="mt-1 text-sm text-slate-500">Your email and role are controlled by the account administrator.</p></div></div><div className="mt-5 space-y-4"><label><span className="label">Full name</span><input className="input" value={name} onChange={e=>setName(e.target.value)}/></label><label><span className="label">Email</span><input className="input bg-slate-50" value={session?.user?.email||''} disabled/></label><label><span className="label">Role</span><input className="input bg-slate-50 capitalize" value={(profile?.role||'').replace('_',' ')} disabled/></label><button className="btn-primary" disabled={busy==='profile'} onClick={saveProfile}><Save size={16}/>{busy==='profile'?'Saving...':'Save profile'}</button></div></section>
  <section className="panel p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><KeyRound size={21}/></div><div><h2 className="font-bold">Change password</h2><p className="mt-1 text-sm text-slate-500">Use at least 10 characters and do not reuse a password from another account.</p></div></div><div className="mt-5 space-y-4"><label><span className="label">New password</span><input type="password" minLength="10" autoComplete="new-password" className="input" value={password} onChange={e=>setPassword(e.target.value)}/></label><label><span className="label">Confirm new password</span><input type="password" minLength="10" autoComplete="new-password" className="input" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="btn-primary" disabled={busy==='password'||!password} onClick={changePassword}><ShieldCheck size={16}/>{busy==='password'?'Updating...':'Change password'}</button></div></section>
 </div><Toast toast={toast} onClose={()=>setToast(null)}/></>;
}
