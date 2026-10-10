import { t, useLocale } from "../context/LocaleContext.jsx";
import { useEffect, useState } from 'react';
import { ArrowRight, Boxes, Check, Eye, EyeOff, LockKeyhole, Mail, PackageCheck, Search, ShieldCheck, ShoppingCart } from 'lucide-react';
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
      <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} className="input min-h-12 pl-11 pr-14" required value={value} onChange={onChange} aria-describedby={hint ? `${id}-hint` : undefined} />
      <button type="button" aria-label={t(visible?'Hide {v0}':'Show {v0}',{v0:t(label).toLowerCase()})} aria-pressed={visible} onClick={() => setVisible(current => !current)} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        {visible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
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
    verifyOtp
  } = useAuth();
  const [otpMode, setOtpMode] = useState(false),
    [otpSent, setOtpSent] = useState(false),
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
    const email = login.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const {
        error
      } = await requestOtp(email);
      if (error) throw error;
      setLogin(l => ({
        ...l,
        email
      }));
      setOtpSent(true);
      setResendAt(Date.now() + 60000);
      setNow(Date.now());
    } catch (e) {
      setError(e.status === 429 ? 'Too many code requests. Wait a moment before trying again.' : 'Could not send the sign-in code. Check your email address and connection, or ask your store owner.');
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
    if (otpMode && !otpSent) {
      await sendOtp();
      return;
    }
    if (otpMode && !/^[0-9]{6,10}$/.test(otp)) {
      setError('Enter the 6 to 10 digit code from your email.');
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
      setError(connectionMessage(e, 'sign-in service'));
    } finally {
      setLoading(false);
    }
  }
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
  return <div className="flex min-h-screen flex-col bg-[#f8f9fb] px-4 py-6 sm:px-8 sm:py-10">
    <header className="mx-auto flex w-full max-w-5xl items-center gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><Boxes aria-hidden="true" size={25} /></span>
      <div className="min-w-0"><p className="text-xl font-bold tracking-tight text-slate-900">{t("PartCast")}</p><p className="text-sm text-slate-500">{t("NPG Auto Parts")}</p></div><div className="ml-auto shrink-0"><Preferences /></div>
    </header>

    <div className="mx-auto my-auto grid w-full max-w-5xl gap-10 py-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20 lg:py-16">
      <div className="hidden lg:block">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700"><Check aria-hidden="true" size={16} />{t(" A simpler day at the store")}</p>
        <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-slate-900">{t("Your parts.")}<br />{t("All in one place.")}</h2>
        <p className="mt-5 max-w-md text-base leading-7 text-slate-600">{t("Find what you need, keep stock up to date, and know what to order next.")}</p>
        <div className="mt-8 space-y-5">
          {[{
            icon: Search,
            title: 'Find a part quickly',
            text: 'Search by its name or part number.'
          }, {
            icon: ShoppingCart,
            title: 'Record a sale',
            text: 'Choose the part and enter how many you sold.'
          }, {
            icon: PackageCheck,
            title: 'See what needs restocking',
            text: 'Get a clear list of parts running low.'
          }].map(({
            icon: Icon,
            title,
            text
          }) => <div key={title} className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"><Icon aria-hidden="true" size={22} /></span>
            <div><p className="font-semibold text-slate-800">{t(title)}</p><p className="mt-1 text-sm leading-5 text-slate-500">{t(text)}</p></div>
          </div>)}
        </div>
      </div>

      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="login-title">
        <p className="text-sm font-semibold text-red-600">{needsSetup ? t('Welcome to your store') : t('Welcome back')}</p>
        <h1 id="login-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{needsSetup ? t('Create the owner account') : t('Sign in to PartCast')}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{needsSetup ? t('Set up the owner account once to get started. Have your private setup code ready.') : t('Use the email and password your store owner gave you.')}</p>

        {!storeConfigured && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{t(storeConnectionIssue)}</p>}
        {serverError && <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><p>{t(serverError)}</p><button type="button" className="btn-secondary mt-3 w-full border-amber-200 bg-white text-amber-900" disabled={checkingServer} onClick={checkServer}>{checkingServer ? t('Checking connection…') : t('Check connection again')}</button></div>}
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{t(error)}</div>}

        {needsSetup ? <form onSubmit={submitSetup} className="mt-7 space-y-5" aria-busy={loading}>
          <PasswordField id="setup-secret" label={t("Setup secret")} value={setup.setupSecret} onChange={e => setSetup({
            ...setup,
            setupSecret: e.target.value
          })} autoComplete="off" hint={t("This is the private setup code provided by the person who set up PartCast.")} />
          <div><label htmlFor="owner-name" className="label">{t("Owner full name")}</label><input id="owner-name" minLength={2} maxLength={120} autoComplete="name" className="input min-h-12" required value={setup.fullName} onChange={e => setSetup({
              ...setup,
              fullName: e.target.value
            })} /></div>
          <div><label htmlFor="owner-email" className="label">{t("Email address")}</label><input id="owner-email" maxLength={254} type="email" autoComplete="email" className="input min-h-12" required value={setup.email} onChange={e => setSetup({
              ...setup,
              email: e.target.value
            })} /></div>
          <PasswordField id="owner-password" value={setup.password} onChange={e => setSetup({
            ...setup,
            password: e.target.value
          })} autoComplete="new-password" minLength={10} hint={t("Use at least 10 characters. Keep your password private.")} />
          <button disabled={loading || !storeConfigured || Boolean(apiConnectionIssue)} className="btn-primary min-h-12 w-full">{loading ? t('Creating account…') : t('Create owner account')}{!loading && <ArrowRight aria-hidden="true" size={19} />}</button>
        </form> : <form onSubmit={submitLogin} className="mt-7 space-y-5" aria-busy={loading}>
          <div><label htmlFor="login-email" className="label">{t("Email address")}</label><div className="relative"><Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={19} /><input id="login-email" type="email" autoComplete="email" spellCheck={false} autoCapitalize="none" className="input min-h-12 pl-11" required value={login.email} onChange={e => setLogin({
                ...login,
                email: e.target.value
              })} placeholder={t("Your email address")} maxLength={254} readOnly={otpMode && otpSent} /></div></div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Sign-in method")}><button type="button" className={!otpMode ? 'btn-primary' : 'btn-secondary'} disabled={loading} aria-pressed={!otpMode} onClick={() => {
              setOtpMode(false);
              setError('');
            }}>{t("Password")}</button><button type="button" className={otpMode ? 'btn-primary' : 'btn-secondary'} disabled={loading} aria-pressed={otpMode} onClick={() => {
              setOtpMode(true);
              setError('');
            }}>{t("Email code")}</button></div>
          {otpMode ? otpSent ? <div><label className="label" htmlFor="login-otp">{t("Email sign-in code")}</label><input id="login-otp" className="input" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={10} pattern="[0-9]{6,10}" value={otp} onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))} /><p className="mt-2 text-sm text-slate-500">{t("Check your inbox and spam folder. Enter the code from your most recent email.")}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={loading || resendSeconds > 0} onClick={sendOtp}>{resendSeconds ? t("Resend in {v0}s", {
                  v0: resendSeconds
                }) : t('Resend code')}</button><button type="button" className="btn-secondary" disabled={loading} onClick={() => {
                setOtpSent(false);
                setOtp('');
              }}>{t("Change email")}</button></div></div> : <p className="text-sm text-slate-500">{t("We will email a one-time sign-in code to your existing staff account. You need internet to receive and verify it.")}</p> : <PasswordField id="login-password" value={login.password} onChange={e => setLogin({
            ...login,
            password: e.target.value
          })} autoComplete="current-password" />}

          <button disabled={loading || !storeConfigured || Boolean(apiConnectionIssue)} className="btn-primary min-h-12 w-full">{loading ? t('Signing in…') : otpMode ? otpSent ? t('Verify code and sign in') : t('Send email code') : t('Sign in securely')}{!loading && <ArrowRight aria-hidden="true" size={19} />}</button>
        </form>}

        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-sm font-semibold text-slate-700">{t("Need help signing in?")}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{t("Ask your store owner to check your account or password.")}</p>
        </div>
      </section>
    </div>

    <footer className="mx-auto flex max-w-5xl items-center justify-center gap-2 text-center text-xs leading-5 text-slate-500 sm:text-sm"><ShieldCheck aria-hidden="true" className="shrink-0" size={17} /><p>{t("Your account is for your use only. You need internet to sign in.")}</p></footer>
  </div>;
}
