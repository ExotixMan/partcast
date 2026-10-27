import Form from '../components/Form.jsx';
import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { storeConfigured, storeConnectionIssue } from '../lib/supabase.js';
import { publicApi, apiConnectionIssue } from '../lib/api.js';
import Preferences from '../components/Preferences.jsx';
import { connectionMessage } from '../lib/connection.js';
function PasswordField({
  id,
  label = 'Password',
  value,
  onChange,
  autoComplete,
  minLength,
  hint
}) {
  useLocale();
  const [visible, setVisible] = useState(false);
  return <div>
    <label className="label" htmlFor={id}>{t(label)}</label>
    <div className="relative">
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} className="input min-h-14 pr-24" required value={value} onChange={onChange} aria-describedby={hint ? `${id}-hint` : undefined} />
      <button type="button" aria-label={t(visible?'Hide {v0}':'Show {v0}',{v0:t(label).toLowerCase()})} aria-pressed={visible} onClick={() => setVisible(current => !current)} className="absolute right-1 top-1/2 flex min-h-11 -translate-y-1/2 items-center gap-1.5 rounded px-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900">
        {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}<span>{visible?t('Hide'):t('Show')}</span>
      </button>
    </div>
    {hint && <p id={`${id}-hint`} className="mt-2 text-sm leading-5 text-slate-500">{t(hint)}</p>}
  </div>;
}
export default function LoginPage() {
  useLocale();
  const {
    signIn,
    requestOtp,
    verifyOtp, needsOtp, session, signOut
  } = useAuth();
  const otpMode = Boolean(needsOtp && session);
  const sentFor = useRef(null);
  const [otpSent, setOtpSent] = useState(false),
    [otp, setOtp] = useState(''),
    [resendAt, setResendAt] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  async function sendOtp() {
    if (loading || resendSeconds > 0) return;
    setError('');
    const email = session?.user?.email || login.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await requestOtp();
      setLogin(l => ({
        ...l,
        email
      }));
      setOtpSent(true);
      setResendAt(Date.now() + 60000);
      setNow(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [checkingServer, setCheckingServer] = useState(false);
  const [login, setLogin] = useState({
    email: '',
    password: ''
  });
  const [setup, setSetup] = useState({
    setupSecret: '',
    fullName: '',
    email: '',
    password: ''
  });
  async function checkServer() {
    setCheckingServer(true);
    setServerError('');
    try {
      const result = await publicApi('/setup/status');
      setNeedsSetup(Boolean(result.needsSetup));
    } catch (e) {
      setServerError(connectionMessage(e));
    } finally {
      setCheckingServer(false);
    }
  }
  useEffect(() => {
    checkServer();
  }, []);
  async function submitLogin(e) {
    e.preventDefault();
    if (loading) return;
    if (otpMode && !/^[0-9]{6}$/.test(otp)) {
      setError('Enter the 6 digit code from your email.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const {
        error
      } = otpMode ? await verifyOtp(login.email.trim(), otp) : await signIn(login.email.trim(), login.password);
      if (error) setError(otpMode ? 'The code is incorrect or expired. Request a new code and try again.' : connectionMessage(error, 'sign-in service'));
    } catch (e) {
      setError(e.status ? e.message : connectionMessage(e, 'sign-in service'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!otpMode || sentFor.current === session.access_token) return;
    sentFor.current = session.access_token;
    sendOtp();
  },[otpMode,session?.access_token]);
  async function submitSetup(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await publicApi('/setup/bootstrap', {
        method: 'POST',
        body: JSON.stringify(setup)
      });
      setNeedsSetup(false);
      setLogin({
        email: setup.email,
        password: setup.password
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return <div className="login-page flex min-h-[100dvh] flex-col bg-white">
    <header className="border-b border-slate-200 px-3 py-5 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-2xl font-bold tracking-tight text-slate-950" aria-label="PartCast">Part<span className="text-red-600">Cast</span><span className="text-red-600">.</span></p>
        <Preferences />
      </div>
    </header>

    <div className="flex flex-1 items-center justify-center px-5 py-9 sm:px-8 sm:py-14">
      <section className="w-full max-w-[26rem]" aria-labelledby="login-title">
        <p className="text-sm font-semibold tracking-wide text-slate-600">{t('NPG Auto Parts')}</p>
        <h1 id="login-title" className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-slate-950">{needsSetup ? t('Create the Super Admin account') : otpMode ? t('Check your email') : t('Sign in')}</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">{needsSetup ? t('Create the first account once. Have your private setup code ready.') : otpMode ? (otpSent?t('Your password is correct. Enter the code sent to your email to finish signing in.'):t('Your password is correct. Request an email code to finish signing in.')) : t('Use your staff email and password.')}</p>

        {!needsSetup && <ol className="mt-6 grid grid-cols-2 gap-5 text-sm" aria-label={t('Sign-in steps')}>
          <li aria-current={!otpMode?'step':undefined} className={`flex min-h-11 items-center gap-2 border-b-2 pb-2 ${otpMode?'border-slate-200 text-slate-600':'border-red-600 font-semibold text-slate-950'}`}>{t('1. Password')}{otpMode&&<Check aria-hidden="true" className="shrink-0 text-emerald-700" size={17}/>}</li>
          <li aria-current={otpMode?'step':undefined} className={`flex min-h-11 items-center border-b-2 pb-2 ${otpMode?'border-red-600 font-semibold text-slate-950':'border-slate-200 text-slate-600'}`}>{t('2. Email code')}</li>
        </ol>}

        {!storeConfigured && <p role="alert" className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{t(storeConnectionIssue)}</p>}
        {serverError && <div role="alert" className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><p>{t(serverError)}</p><button type="button" className="btn-secondary mt-3 w-full border-amber-200 bg-white text-amber-900" disabled={checkingServer} onClick={checkServer}>{checkingServer ? t('Checking connection…') : t('Check connection again')}</button></div>}
        {error && <div role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-base leading-7 text-red-800">{t(error)}</div>}

        {needsSetup ? <Form onSubmit={submitSetup} className="mt-6 space-y-5" aria-busy={loading}>
          <PasswordField id="setup-secret" label={t('Setup secret')} value={setup.setupSecret} onChange={e => setSetup({...setup,setupSecret:e.target.value})} autoComplete="off" hint={t('This is the private setup code provided by the person who set up PartCast.')} />
          <div><label htmlFor="owner-name" className="label">{t('Owner full name')}</label><input id="owner-name" minLength={2} maxLength={120} autoComplete="name" className="input min-h-14" required value={setup.fullName} onChange={e => setSetup({...setup,fullName:e.target.value})} /></div>
          <div><label htmlFor="owner-email" className="label">{t('Email address')}</label><input id="owner-email" maxLength={254} type="email" autoComplete="email" className="input min-h-14" required value={setup.email} onChange={e => setSetup({...setup,email:e.target.value})} /></div>
          <PasswordField id="owner-password" value={setup.password} onChange={e => setSetup({...setup,password:e.target.value})} autoComplete="new-password" minLength={10} hint={t('Use at least 10 characters. Keep your password private.')} />
          <button disabled={loading || !storeConfigured || Boolean(apiConnectionIssue)} className="btn-primary min-h-14 w-full">{loading ? t('Creating account…') : t('Create Super Admin account')}{!loading && <ArrowRight aria-hidden="true" size={19} />}</button>
        </Form> : <Form onSubmit={submitLogin} className="mt-6 space-y-5" aria-busy={loading}>
          <div><label htmlFor="login-email" className="label">{t('Email address')}</label><input id="login-email" type="email" autoComplete="email" spellCheck={false} autoCapitalize="none" className={`input min-h-14 ${otpMode?'bg-slate-50':''}`} required value={otpMode ? session.user.email : login.email} onChange={e => setLogin({...login,email:e.target.value})} placeholder={t('Your email address')} maxLength={254} readOnly={otpMode} /></div>
          {otpMode ? <div>
            <label className="label" htmlFor="login-otp">{t('Email sign-in code')}</label>
            <input id="login-otp" className="input min-h-16 text-center font-mono text-2xl tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" aria-describedby="login-otp-help" required minLength={6} maxLength={6} pattern="[0-9]{6}" value={otp} onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))} />
            <p id="login-otp-help" className="mt-3 text-sm leading-6 text-slate-600">{otpSent?t('Check your inbox and spam folder. Enter the code from your most recent email.'):t('Request a code first. If sending fails, check the message above.')}</p>
          </div> : <PasswordField id="login-password" value={login.password} onChange={e => setLogin({...login,password:e.target.value})} autoComplete="current-password" />}

          <button disabled={loading || !storeConfigured || Boolean(apiConnectionIssue)} className="btn-primary min-h-14 w-full">{loading ? t('Signing in…') : otpMode ? t('Verify code and sign in') : t('Continue')}{!loading && <ArrowRight aria-hidden="true" size={19} />}</button>

          {otpMode && <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="min-h-11 rounded px-1 text-sm font-semibold text-red-700 underline underline-offset-4 disabled:cursor-not-allowed disabled:text-slate-500 disabled:no-underline" disabled={loading || resendSeconds > 0} onClick={sendOtp}>{resendSeconds ? t('Resend in {v0}s',{v0:resendSeconds}) : otpSent ? t('Resend code') : t('Send email code')}</button>
            <button type="button" className="min-h-11 rounded px-1 text-sm font-semibold text-slate-600 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={signOut}>{t('Use another account')}</button>
          </div>}
        </Form>}

        <div className="mt-7 border-t border-slate-200 pt-5">
          <p className="text-sm font-semibold text-slate-800">{t('Need help signing in?')}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{otpMode?t('Ask your Super Admin to check Gmail settings if an email code cannot be sent.'):t('Ask your store owner to check your account or password.')}</p>
        </div>
      </section>
    </div>

    <footer className="px-5 pb-6 text-center text-sm text-slate-600"><p>{t('Internet is needed to sign in.')}</p><nav aria-label={t('Legal information')} className="mt-2 flex flex-wrap justify-center gap-x-5"><a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href="/privacy.html">{t('Privacy Policy')}</a><a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href="/terms.html">{t('Terms of Service')}</a></nav></footer>
  </div>;
}
