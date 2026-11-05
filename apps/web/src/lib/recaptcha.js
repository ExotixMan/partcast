let pending;

export function loadRecaptcha() {
  if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const ready = () => finish(window.grecaptcha?.render ? null : new Error('Security check unavailable.'));
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onerror = null;
      if (window.__partcastRecaptchaReady === ready) delete window.__partcastRecaptchaReady;
      if (error) { script.remove(); reject(error); }
      else resolve(window.grecaptcha);
    };
    const timer = setTimeout(() => finish(new Error('Security check timed out.')), 15000);
    window.__partcastRecaptchaReady = ready;
    script.src = 'https://www.google.com/recaptcha/api.js?onload=__partcastRecaptchaReady&render=explicit';
    script.async = true;
    script.onerror = () => finish(new Error('Security check unavailable.'));
    document.head.append(script);
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
