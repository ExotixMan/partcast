import { supabase } from './supabase.js';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:10000').replace(/\/$/, '');

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function request(path, options = {}) {
  const headers = { ...(await authHeader()), ...(options.headers || {}) };
  const isForm = options.body instanceof FormData;
  if (!isForm && options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (contentType.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      message = body.error || message;
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  if (contentType.includes('application/json')) return res.json();
  return res.blob();
}

export const api = {
  get: path => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  download: async path => {
    const blob = await request(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() || 'partcast-report.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
};

export async function publicApi(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
