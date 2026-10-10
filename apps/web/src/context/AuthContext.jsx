import {t} from './LocaleContext.jsx';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, authStorageKey } from '../lib/supabase.js';
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
  const [offlineAccess, setOfflineAccess] = useState(!navigator.onLine);
  useEffect(() => {
    let mounted = true;
    if (navigator.onLine) supabase.auth.getSession().then(({data}) => { if (mounted) { setSession(data.session); if (!data.session) setLoading(false); } }).catch(() => setLoading(false));
    else if (!session) setLoading(false);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setApiSession(next); setSession(next);
      if (!next) { setProfile(null); setLoading(false); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session) return;
    let live = true;
    setApiSession(session); setLoading(true);
    api.get('/api/me').then(r => { if (live) { setProfile(r.user); setOfflineAccess(Boolean(r.offline)); } }).catch(async e => {
      if (!live) return;
      if ([401,403].includes(e.status)) { await clearAccount(session.user.id); await supabase.auth.signOut({scope:'local'}); }
      setProfile(null); setSession(null); setApiSession(null);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [session?.access_token]);
  const value = useMemo(() => ({
    session, profile, loading, offlineAccess,
    signIn: (email,password) => supabase.auth.signInWithPassword({email,password}),
    requestOtp:email=>supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}}),
    verifyOtp:(email,token)=>supabase.auth.verifyOtp({email,token,type:'email'}),
    signOut: async () => {
      const userId = session?.user?.id;
      if (userId && (await queueItems(userId)).length && !window.confirm(t('You have unsent changes. Signing out removes them from this device. Sign out anyway?'))) return;
      setApiSession(null); setProfile(null); setSession(null);
      if (userId) await clearAccount(userId);
      await supabase.auth.signOut({scope:'local'});
    },
    refreshProfile: async () => { const r = await api.get('/api/me'); setProfile(r.user); }
  }), [session,profile,loading,offlineAccess]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
