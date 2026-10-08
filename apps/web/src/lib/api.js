import { readCache, saveCache, queueItems, projectedProducts, enqueueMovement, drainQueue } from './offline.js';
import { resolveApiConnection, connectionMessage } from './connection.js';

const connection = resolveApiConnection(import.meta.env.VITE_API_URL, window.location.href, import.meta.env.PROD);
const API_URL = connection.url;
export const apiConnectionIssue = connection.error || null;
let currentSession = null;
let syncing = null;
export function setApiSession(session) { currentSession = session; }
const cacheable = path => /^\/api\/(me|dashboard|products(?:\?|\/|$)|suppliers$|reorder|forecast\/|data-quality|notifications$)/.test(path);
export class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }

function checkConnection() {
  if (apiConnectionIssue) throw Object.assign(new ApiError(apiConnectionIssue, 0), { code: 'configuration' });
}
async function fetchApi(path, options) {
  checkConnection();
  try {
    const result = await fetch(`${API_URL}${path}`, options);
    window.dispatchEvent(new CustomEvent('partcast:connection', { detail: true }));
    return result;
  } catch (error) {
    window.dispatchEvent(new CustomEvent('partcast:connection', { detail: false }));
    if (error.name === 'AbortError') throw error;
    throw new ApiError(connectionMessage(error), 0);
  }
}

async function networkRequest(path, options = {}) {
  const { responseType, ...fetchOptions } = options;
  const session = currentSession;
  if (!session?.access_token) throw new ApiError('Please sign in to continue.', 401);
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${session.access_token}` };
  if (!(options.body instanceof FormData) && options.body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  res = await fetchApi(path, { ...fetchOptions, headers, signal: options.signal || AbortSignal.timeout(path.includes('/forecast/train') ? 180000 : 20000) });
  const json = (res.headers.get('content-type') || '').includes('application/json');
  if (!res.ok) {
    const body = json ? await res.json().catch(() => ({})) : {};
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return null;
  if (responseType === 'blob' && /application\/(vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|octet-stream)/.test(res.headers.get('content-type') || '')) return res.blob();
  if (!json || responseType === 'blob') throw new ApiError('The store server returned unexpected information. Ask the store owner to check the server address.', 502);
  return res.json();
}

async function localRead(path) {
  const userId = currentSession?.user?.id;
  if (!userId) throw new ApiError('Please sign in to continue.', 401);
  if (path.startsWith('/api/products?')) {
    const snapshot = await readCache(userId, '/api/offline-snapshot');
    if (snapshot) {
      const params = new URLSearchParams(path.split('?')[1]), q = (params.get('q') || '').toLowerCase();
      const rows = projectedProducts(snapshot.value.products, await queueItems(userId)).filter(p => `${p.part_number || ''} ${p.description} ${p.brand || ''}`.toLowerCase().includes(q) && (!['low','out'].includes(params.get('status')) || p.stock_status === params.get('status')));
      const page = Number(params.get('page')) || 1, pageSize = Number(params.get('pageSize')) || 25;
      return { data: rows.slice((page-1)*pageSize,page*pageSize), count: rows.length, page, pageSize, offline: true, savedAt: snapshot.savedAt };
    }
  }
  if (path === '/api/suppliers') {
    const snapshot = await readCache(userId, '/api/offline-snapshot');
    if (snapshot) return { data: snapshot.value.suppliers, offline: true, savedAt: snapshot.savedAt };
  }
  const cached = cacheable(path) && await readCache(userId, path);
  if (!cached) throw new ApiError('This information is not saved on this device. Connect to the internet to load it.', 0);
  return { ...cached.value, offline: true, savedAt: cached.savedAt };
}

async function request(path, options = {}) {
  const userId = currentSession?.user?.id;
  const read = !options.method || options.method === 'GET';
  if (read && path.startsWith('/api/products?') && userId && (await queueItems(userId)).length) return localRead(path);
  if (!navigator.onLine) {
    if (read) return localRead(path);
    throw new ApiError('This action needs an internet connection.', 0);
  }
  try {
    const result = await networkRequest(path, options);
    if (read && cacheable(path) && userId === currentSession?.user?.id) await saveCache(userId, path, result).catch(() => {});
    return result;
  } catch (error) {
    if (read && !error.status && error.code !== 'configuration' && error.name !== 'AbortError') {
      try { return await localRead(path); } catch (cachedError) { if (!cachedError.status) throw error; throw cachedError; }
    }
    throw error;
  }
}

export async function prepareOffline() {
  if (!currentSession?.user?.id || !navigator.onLine) return;
  const userId = currentSession.user.id;
  const snapshot = await networkRequest('/api/offline-snapshot');
  if (userId !== currentSession?.user?.id) return;
  await saveCache(userId, '/api/offline-snapshot', snapshot);
}
export async function syncOffline() {
  if (syncing || !currentSession?.user?.id || !navigator.onLine) return syncing;
  const userId = currentSession.user.id;
  syncing = drainQueue(userId, payload => {
    if (currentSession?.user?.id !== userId) throw new ApiError('Account changed. Please sign in again.', 401);
    return networkRequest('/api/inventory/movement', { method: 'POST', body: JSON.stringify(payload) });
  }).then(() => prepareOffline()).finally(() => { syncing = null; });
  return syncing;
}
async function movement(body) {
  const userId = currentSession?.user?.id;
  if (!userId) throw new ApiError('Please sign in first.', 401);
  const profile = await readCache(userId, '/api/me');
  const snapshot = await readCache(userId, '/api/offline-snapshot');
  if (!profile?.value?.user?.active || !snapshot) {
    if (!navigator.onLine) throw new ApiError('Connect once to save your inventory and verify your account before working offline.', 0);
    return networkRequest('/api/inventory/movement', { method: 'POST', body: JSON.stringify({ ...body, client_operation_id: crypto.randomUUID() }) });
  }
  const items = await queueItems(userId);
  if (items.some(i => i.status === 'conflict')) throw new ApiError('Review the waiting transaction before recording more stock changes.', 409);
  const product = projectedProducts(snapshot.value.products, items).find(p => p.id === body.product_id);
  const quantity = Number(body.quantity);
  if (!product || !Number.isFinite(quantity) || quantity <= 0) throw new ApiError('Choose a saved product and a quantity greater than zero.', 422);
  if (!['stock_in','stock_out','sale'].includes(body.tx_type)) throw new ApiError('Choose a valid stock movement.', 422);
  if (body.tx_type !== 'stock_in' && quantity > Number(product.current_stock)) throw new ApiError('There is not enough saved stock for this transaction.', 409);
  const entry = await enqueueMovement(userId, body);
  if (navigator.onLine) { try { await syncOffline(); } catch (error) { if (error.status) throw error; } }
  const pending = (await queueItems(userId)).some(i => i.key === entry.key);
  return { queued: pending, clientOperationId: entry.payload.client_operation_id };
}
export const api = {
  get: path => request(path),
  post: (path, body) => path === '/api/inventory/movement' ? movement(body) : request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  download: async path => {
    const blob = await request(path, { responseType: 'blob' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = path.split('/').pop() || 'partcast-report.xlsx';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
};
export async function publicApi(path, options = {}) {
  const res = await fetchApi(path, { ...options, signal: options.signal || AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (!(res.headers.get('content-type') || '').includes('application/json')) throw new ApiError('The store server returned a web page instead of store data. Ask the store owner to check the server address.', 502);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || `Request failed (${res.status})`, res.status);
  return body;
}
