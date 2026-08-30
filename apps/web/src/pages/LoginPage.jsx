import { useEffect, useState } from 'react';
import { LockKeyhole, Mail, ShieldCheck, Wrench } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { publicApi } from '../lib/api.js';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [needsSetup,setNeedsSetup]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [login,setLogin]=useState({email:'',password:''});
  const [setup,setSetup]=useState({setupSecret:'',fullName:'',email:'',password:''});

  useEffect(()=>{ publicApi('/setup/status').then(r=>setNeedsSetup(r.needsSetup)).catch(()=>{}); },[]);

  async function submitLogin(e){
    e.preventDefault();setLoading(true);setError('');
    const {error}=await signIn(login.email,login.password);
    if(error)setError(error.message);
    setLoading(false);
  }
  async function submitSetup(e){
    e.preventDefault();setLoading(true);setError('');
    try{await publicApi('/setup/bootstrap',{method:'POST',body:JSON.stringify(setup)});setNeedsSetup(false);setLogin({email:setup.email,password:setup.password});}
    catch(e){setError(e.message);}finally{setLoading(false);}
  }

  return <div className="min-h-screen bg-[#050505] p-4 sm:p-8">
    <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl sm:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.08fr_.92fr]">
      <div className="relative hidden overflow-hidden bg-[#050505] p-10 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-red-600/20 blur-3xl"/>
        <img src="/npg-logo.png" alt="NPG Autoparts" className="relative h-20 w-80 object-contain object-left"/>
        <div className="relative my-auto max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[.22em] text-red-400">PartCast</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">Demand forecasting and inventory control in one secure system.</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">Monitor spare parts, record stock movement, analyze demand, receive low-stock alerts, create reorder recommendations, and coordinate supplier replenishment.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><ShieldCheck className="mb-3 text-red-400"/><p className="font-semibold">Role-based security</p><p className="mt-1 text-xs leading-5 text-slate-400">Protected staff access and audited changes.</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><Wrench className="mb-3 text-red-400"/><p className="font-semibold">Built for NPG</p><p className="mt-1 text-xs leading-5 text-slate-400">Responsive on desktop, tablet, and mobile.</p></div>
          </div>
        </div>
        <p className="relative text-xs text-slate-500">NPG Autoparts · Toyota Specialist</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <img src="/npg-logo.png" alt="NPG Autoparts" className="mb-8 h-16 w-64 object-contain object-left lg:hidden"/>
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-red-600">{needsSetup?'First-time setup':'Authorized staff'}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{needsSetup?'Create the owner account':'Sign in to PartCast'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{needsSetup?'Use the setup secret configured on the server. This setup can only run once.':'Use your NPG Autoparts staff account to continue.'}</p>
          {error&&<div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {needsSetup ? <form onSubmit={submitSetup} className="mt-7 space-y-4">
            <label><span className="label">Setup secret</span><div className="relative"><LockKeyhole className="absolute left-3 top-3 text-slate-400" size={18}/><input type="password" className="input pl-10" required value={setup.setupSecret} onChange={e=>setSetup({...setup,setupSecret:e.target.value})}/></div></label>
            <label><span className="label">Owner full name</span><input className="input" required value={setup.fullName} onChange={e=>setSetup({...setup,fullName:e.target.value})}/></label>
            <label><span className="label">Email address</span><input type="email" className="input" required value={setup.email} onChange={e=>setSetup({...setup,email:e.target.value})}/></label>
            <label><span className="label">Password</span><input type="password" minLength={10} className="input" required value={setup.password} onChange={e=>setSetup({...setup,password:e.target.value})}/><span className="mt-1 block text-xs text-slate-400">Use at least 10 characters.</span></label>
            <button disabled={loading} className="btn-primary w-full">{loading?'Creating account...':'Create owner account'}</button>
          </form> : <form onSubmit={submitLogin} className="mt-7 space-y-4">
            <label><span className="label">Email address</span><div className="relative"><Mail className="absolute left-3 top-3 text-slate-400" size={18}/><input type="email" autoComplete="email" className="input pl-10" required value={login.email} onChange={e=>setLogin({...login,email:e.target.value})}/></div></label>
            <label><span className="label">Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-3 text-slate-400" size={18}/><input type="password" autoComplete="current-password" className="input pl-10" required value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/></div></label>
            <button disabled={loading} className="btn-primary w-full">{loading?'Signing in...':'Sign in securely'}</button>
          </form>}
          <div className="mt-7 flex items-start gap-3 rounded-xl bg-slate-50 p-4"><ShieldCheck className="mt-0.5 shrink-0 text-slate-500" size={18}/><p className="text-xs leading-5 text-slate-500">Sessions use Supabase authentication. Sensitive service credentials are kept only on the server and are never included in the browser bundle.</p></div>
        </div>
      </div>
    </div>
  </div>;
}
