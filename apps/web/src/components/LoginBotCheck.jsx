import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { t, useLocale } from '../context/LocaleContext.jsx';
import { loadRecaptcha } from '../lib/recaptcha.js';

export default function LoginBotCheck({ siteKey, resetKey, onChange }) {
  const { theme, language } = useLocale();
  const container = useRef(null);
  const [size, setSize] = useState('compact');
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize(entry.contentRect.width >= 304 ? 'normal' : 'compact'));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true, widget, expiry;
    const mount = document.createElement('div');
    container.current.append(mount);
    onChange('');
    setStatus('loading');
    const clearToken = next => {
      if (!active) return;
      clearTimeout(expiry);
      onChange('');
      setStatus(next);
    };
    loadRecaptcha().then(api => {
      if (!active) return;
      widget = api.render(mount, {
        sitekey: siteKey,
        theme: theme === 'dark' ? 'dark' : 'light',
        size,
        callback: token => {
          if (!active || !token) return;
          clearTimeout(expiry);
          onChange(token);
          setStatus('verified');
          expiry = setTimeout(() => clearToken('expired'), 110000);
        },
        'expired-callback': () => clearToken('expired'),
        'error-callback': () => clearToken('error')
      });
      setStatus(current => current === 'loading' ? 'ready' : current);
    }).catch(() => clearToken('error'));
    return () => {
      active = false;
      clearTimeout(expiry);
      if (widget !== undefined) window.grecaptcha?.reset(widget);
      mount.remove();
    };
  }, [siteKey, resetKey, attempt, theme, language, size, onChange]);
  const failed = ['error', 'expired'].includes(status);
  return <div className="min-w-0 space-y-2">
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ShieldCheck size={18} aria-hidden="true" />{t('Security check')}</p>
    <div ref={container} className="min-w-0" />
    <p role="status" className={`text-sm leading-6 ${failed ? 'text-red-700' : status === 'verified' ? 'text-emerald-700' : 'text-slate-600'}`}>
      {status === 'loading' ? t('Loading security check…') : status === 'verified' ? t('Security check complete.') : status === 'expired' ? t('Security check expired. Please try again.') : status === 'error' ? t('Security check could not load. Check your connection and try again.') : t('Complete the security check below.')}
    </p>
    {failed && <button type="button" className="btn-secondary min-h-11" onClick={() => setAttempt(current => current + 1)}>{t('Try security check again')}</button>}
  </div>;
}
