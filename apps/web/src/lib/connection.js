const localHost = hostname => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);

export function resolveApiConnection(value, pageUrl, production) {
  const configured = String(value || '').trim();
  const raw = configured.replace(/\/+$/, '');
  if (!raw) {
    if (production && configured !== '/') return { error: 'The store server address has not been set for this website. Ask the store owner to complete the connection setup.' };
    return { url: configured === '/' ? '' : 'http://localhost:10000' };
  }
  if (raw.startsWith('/') && !raw.startsWith('//')) return { url: raw };
  try {
    const api = new URL(raw), page = new URL(pageUrl);
    if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.search || api.hash) throw new Error();
    if (api.pathname !== '/') return { error: 'The store server address must not include /health or a page path. Ask the store owner to use the base server address.' };
    if (localHost(api.hostname) && !localHost(page.hostname)) return { error: 'This website is pointing to a server on another device. Ask the store owner to set the hosted store server address.' };
    if (page.protocol === 'https:' && api.protocol !== 'https:') return { error: 'The store server needs a secure HTTPS address. Ask the store owner to update the connection setup.' };
    return { url: api.origin };
  } catch {
    return { error: 'The store server address is invalid. Ask the store owner to check the connection setup.' };
  }
}

export function supabaseConnectionIssue(url, key) {
  if (!url || !key) return 'The store connection has not been set up yet. Ask the store owner to complete setup before signing in.';
  let endpoint;
  try {
    endpoint = new URL(url);
    if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error();
  } catch { return 'The store connection address is invalid. Ask the store owner to check setup.'; }
  if (key.split('.').length === 3) {
    try {
      const encoded = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(encoded));
      if (claims.role && claims.role !== 'anon') return 'The website needs the public Supabase key. Ask the store owner to correct the connection setup.';
      if (claims.ref && endpoint.hostname.endsWith('.supabase.co') && claims.ref !== endpoint.hostname.split('.')[0]) return 'The website connection and public key belong to different stores. Ask the store owner to use settings from the same Supabase project.';
    } catch { return 'The website public key is invalid. Ask the store owner to check the connection setup.'; }
  }
  if (key.startsWith('sb_secret_')) return 'The website needs the public Supabase key. Ask the store owner to correct the connection setup.';
  return null;
}

export function connectionMessage(error, target = 'store server') {
  if (error?.name === 'TimeoutError') return `The ${target} is taking too long to respond. Please try again shortly.`;
  if (error?.name === 'AuthRetryableFetchError' || error?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(error?.message || '')) return `Cannot reach the ${target}. Check your internet connection and try again. If this continues, ask the store owner to check the connection setup.`;
  return error?.message || 'The request could not be completed. Please try again.';
}
