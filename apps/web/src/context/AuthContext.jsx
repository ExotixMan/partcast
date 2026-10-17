import {t} from './LocaleContext.jsx';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, authStorageKey } from '../lib/supabase.js';
import {verifiedCacheMatches} from '../lib/access.js';
import { api, setApiSession } from '../lib/api.js';
import { clearAccount, queueItems } from '../lib/offline.js';
const AuthContext = createContext(null);
function savedSession() {
  if (navigator.onLine) return null;
  try { return JSON.parse(localStorage.getItem(authStorageKey)); } catch { return null; }
}
export function AuthProvider({ children }) {
  const [session, setSession] = useState(savedSession);
  const [profile, setProfile] = useState(null), [loading, setLoading] = useState(true);
  const [needsOtp,setNeedsOtp] = useState(false);
  const [offlineAccess,setOfflineAccess] = useState(!navigator.onLine);
  useEffect(() => {
    let mounted = true;
    if (navigator.onLine) supabase.auth.getSession().then(({data}) => { if (mounted) { setSession(data.session); if (!data.session) setLoading(false); } }).catch(() => setLoading(false));
    else if (!session) setLoading(false);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setApiSession(next); setSession(next);
      if (!next) { setProfile(null); setNeedsOtp(false); setLoading(false); }
    });
    const verify = () => { setProfile(null); setNeedsOtp(true); setLoading(false); };
    window.addEventListener('partcast:verify-email',verify);
    return () => { mounted = false; listener.subscription.unsubscribe(); window.removeEventListener('partcast:verify-email',verify); };
  }, []);
  useEffect(() => {
    if (!session) return;
    let live = true;
    setApiSession(session); setLoading(!verifiedCacheMatches(session,profile));
    api.get('/api/me').then(r => { if (live) { setProfile(r.user); setNeedsOtp(false); setOfflineAccess(Boolean(r.offline)); } }).catch(async e => {
      if (!live) return;
      setProfile(null);
      if (e.status === 428 || !e.status) { setNeedsOtp(true); return; }
      if ([401,403].includes(e.status)) { await clearAccount(session.user.id,{keepQueue:true}); await supabase.auth.signOut({scope:'local'}); setSession(null); setApiSession(null); }
      else setNeedsOtp(true);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [session?.access_token]);
  useEffect(()=>{
    if(!profile?.verification_expires_at)return;
    const remaining=Date.parse(profile.verification_expires_at)-Date.now();
    const timer=setTimeout(()=>{setProfile(null);setNeedsOtp(true);},Math.min(2147483647,Math.max(0,remaining)));
    return()=>clearTimeout(timer);
  },[profile?.verification_expires_at]);
  const value = useMemo(() => ({
    session,profile,loading,offlineAccess,needsOtp,
    signIn: (email,password) => supabase.auth.signInWithPassword({email,password}),
    requestOtp: () => api.post('/auth/otp/request',{}),
    verifyOtp: async (_email,code) => {
      await api.post('/auth/otp/verify',{code});
      const r = await api.get('/api/me');
      setProfile(r.user); setNeedsOtp(false); setOfflineAccess(false);
      return {error:null};
    },
    signOut: async () => {
      const userId = session?.user?.id;
      if (userId && (await queueItems(userId)).length && !window.confirm(t('You have unsent changes. Signing out removes them from this device. Sign out anyway?'))) return;
      if (navigator.onLine && session) await api.post('/auth/logout',{}).catch(() => {});
      setApiSession(null); setProfile(null); setSession(null); setNeedsOtp(false);
      if (userId) await clearAccount(userId);
      await supabase.auth.signOut({scope:'local'});
    },
    refreshProfile: async () => { const r = await api.get('/api/me'); setProfile(r.user); }
  }), [session,profile,loading,offlineAccess,needsOtp]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
