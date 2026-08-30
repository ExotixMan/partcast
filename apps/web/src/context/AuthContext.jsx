import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setProfile(null); setLoading(false); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    api.get('/api/me').then(r => setProfile(r.user)).catch(async () => {
      await supabase.auth.signOut();
      setProfile(null);
    }).finally(() => setLoading(false));
  }, [session?.access_token]);

  const value = useMemo(() => ({
    session, profile, loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    refreshProfile: async () => { const r = await api.get('/api/me'); setProfile(r.user); }
  }), [session, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
