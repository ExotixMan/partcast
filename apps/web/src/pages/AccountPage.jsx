import { useState } from 'react';
import { KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Toast from '../components/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';

export default function AccountPage() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.full_name || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  async function saveProfile(event) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) { setToast({ type: 'error', message: 'Enter your full name before saving.' }); return; }
    setBusy('profile');
    try {
      await api.patch('/api/me', { full_name: name.trim() });
      await refreshProfile();
      setToast({ message: 'Your name has been saved.' });
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 10) { setToast({ type: 'error', message: 'Use a password with at least 10 characters.' }); return; }
    if (password !== confirm) { setToast({ type: 'error', message: 'The two passwords do not match. Enter the same password in both boxes.' }); return; }
    setBusy('password');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setConfirm('');
      setToast({ message: 'Password changed. Sign in again with your new password.' });
      setTimeout(() => signOut(), 1200);
    } catch (error) {
      setToast({ type: 'error', message: error.message });
    } finally {
      setBusy('');
    }
  }

  return <>
    <PageHeader title="My account" subtitle="Update your name or change the password you use to sign in." />
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel p-5 sm:p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-slate-100 p-3 text-slate-700"><UserRound size={21} aria-hidden="true" /></div><div><h2 className="text-lg font-bold">Your details</h2><p className="mt-1 text-sm leading-6 text-slate-600">Ask your store owner if your email or account access needs to change.</p></div></div>
        <form className="mt-5 space-y-4" onSubmit={saveProfile}><label className="block" htmlFor="account-name"><span className="label">Full name</span><input id="account-name" className="input" autoComplete="name" required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><label className="block" htmlFor="account-email"><span className="label">Email address</span><input id="account-email" className="input bg-slate-50" value={session?.user?.email || ''} readOnly /></label><label className="block" htmlFor="account-role"><span className="label">Account access</span><input id="account-role" className="input bg-slate-50 capitalize" value={(profile?.role || '').replaceAll('_', ' ')} readOnly /></label><button className="btn-primary w-full sm:w-auto" type="submit" disabled={Boolean(busy)}><Save size={17} aria-hidden="true" />{busy === 'profile' ? 'Saving your name…' : 'Save my name'}</button></form>
      </section>
      <section className="panel p-5 sm:p-6"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><KeyRound size={21} aria-hidden="true" /></div><div><h2 className="text-lg font-bold">Change password</h2><p id="password-help" className="mt-1 text-sm leading-6 text-slate-600">Use at least 10 characters. Choose a password you do not use for another account.</p></div></div>
        <form className="mt-5 space-y-4" onSubmit={changePassword}><label className="block" htmlFor="account-password"><span className="label">New password</span><input id="account-password" type="password" minLength={10} required autoComplete="new-password" aria-describedby="password-help" className="input" value={password} onChange={event => setPassword(event.target.value)} /></label><label className="block" htmlFor="account-confirm-password"><span className="label">Enter the new password again</span><input id="account-confirm-password" type="password" minLength={10} required autoComplete="new-password" className="input" value={confirm} onChange={event => setConfirm(event.target.value)} /></label><p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">After changing your password, you will be signed out. Sign in again using the new password.</p><button className="btn-primary w-full sm:w-auto" type="submit" disabled={Boolean(busy) || !password || !confirm}><ShieldCheck size={17} aria-hidden="true" />{busy === 'password' ? 'Changing password…' : 'Change my password'}</button></form>
      </section>
    </div>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}
