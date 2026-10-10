import {verifiedCacheMatches} from './access.js';
import {lineCents,validAmount} from './store.js';
import { readCache, saveCache, queueItems, projectedProducts, enqueueMovement, drainQueue } from './offline.js';
import { resolveApiConnection, connectionMessage } from './connection.js';

const connection = resolveApiConnection(import.meta.env.VITE_API_URL, window.location.href, import.meta.env.PROD);
const API_URL = connection.url;
export const apiConnectionIssue = connection.error || null;
let currentSession = null;
let syncing = null;
export function setApiSession(session) { currentSession = session; }
const cacheable = path => /^\/api\/(me|dashboard|products(?:\?|\/|$)|suppliers$|reorder|forecast\/|data-quality|notifications$|debts(?:\/|$)|barcode\/)/.test(path);
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
    const error = new ApiError(body.error || `Request failed (${res.status})`, res.status);
    error.code = body.code;
    if (res.status === 428) window.dispatchEvent(new Event('partcast:verify-email'));
    throw error;
  }
  if (res.status === 204) return null;
  if(responseType==='image' && /image\/(webp|png|jpeg)/.test(res.headers.get('content-type')||''))return res.blob();
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
      const rows = projectedProducts(snapshot.value.products, await queueItems(userId)).filter(p => `${p.part_number || ''} ${p.description} ${p.brand || ''} ${p.barcode||''} ${(p.search_aliases||[]).join(' ')}`.toLowerCase().includes(q) && (!params.get('category') || params.get('category')==='all'||p.category===params.get('category')) && (!['low','out'].includes(params.get('status')) || p.stock_status === params.get('status')));
      const page = Number(params.get('page')) || 1, pageSize = Number(params.get('pageSize')) || 25;
      return { data: rows.slice((page-1)*pageSize,page*pageSize), count: rows.length, page, pageSize, offline: true, savedAt: snapshot.savedAt };
    }
  }
  if(path.startsWith('/api/barcode/')){const snap=await readCache(userId,'/api/offline-snapshot');if(snap)return {product:projectedProducts(snap.value.products,await queueItems(userId)).find(p=>(p.barcode||'').toLowerCase()===decodeURIComponent(path.split('/').at(-1)).toLowerCase())||null,offline:true};}
  if (path === '/api/suppliers') {
    const snapshot = await readCache(userId, '/api/offline-snapshot');
    if (snapshot) return { data: snapshot.value.suppliers, offline: true, savedAt: snapshot.savedAt };
  }
  const cached = cacheable(path) && await readCache(userId, path);
  if (path === '/api/me' && !verifiedCacheMatches(currentSession,cached?.value?.user)) throw new ApiError('Connect to enter your email code before using this account.',428);
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
    return networkRequest(({batch:'/api/inventory/batch',debt:'/api/debts',payment:'/api/debts/payment'})[payload.kind]||'/api/inventory/movement', { method: 'POST', body: JSON.stringify(payload) });
  }).then(() => prepareOffline()).finally(() => { syncing = null; });
  return syncing;
}
async function movement(body, batch = false) {
  const userId = currentSession?.user?.id;
  if (!userId) throw new ApiError('Please sign in first.', 401);
  const profile = await readCache(userId, '/api/me');
  const snapshot = await readCache(userId, '/api/offline-snapshot');
  if (!verifiedCacheMatches(currentSession,profile?.value?.user) || !snapshot) {
    if (!navigator.onLine) throw new ApiError('Connect once to save your inventory and verify your account before working offline.', 0);
    return networkRequest(batch?'/api/inventory/batch':'/api/inventory/movement', { method: 'POST', body: JSON.stringify({ ...body, client_operation_id: body.client_operation_id||crypto.randomUUID(),occurred_at:body.occurred_at||new Date().toISOString() }) });
  }
  const items = await queueItems(userId);
  if (items.some(i => i.status === 'conflict')) throw new ApiError('Review the waiting transaction before recording more stock changes.', 409);
  const products=projectedProducts(snapshot.value.products,items.filter(i=>i.payload.client_operation_id!==body.client_operation_id));
  const lines=batch?body.lines:[body];
  if(!Array.isArray(lines)||!lines.length||lines.length>100||new Set(lines.map(l=>l.product_id)).size!==lines.length)throw new ApiError('Choose 1 to 100 different parts.',422);
  if(!['stock_in','stock_out','sale'].includes(body.tx_type)||(batch&&body.tx_type==='stock_out'))throw new ApiError('Choose a valid stock movement.',422);
  for(const line of lines){
    const product=products.find(p=>p.id===line.product_id),quantity=Number(line.quantity);
    if(!product||!validAmount(line.quantity,true))throw new ApiError('Choose a saved part and a quantity with at most 2 decimal places.',422);
    if(body.tx_type!=='stock_in'&&Math.round(quantity*100)>Math.round(Number(product.current_stock)*100))throw new ApiError('There is not enough saved stock for this transaction.',409);
    if(batch&&!validAmount(line.unit_price))throw new ApiError('Enter a valid price with at most 2 decimal places.',422);
  }
  if(batch){
    const total=lines.reduce((s,l)=>s+lineCents(l.quantity,l.unit_price),0)/100;
    if(total>=1e12)throw new ApiError('The total is too large.',422);
    if(body.is_credit&&(!body.customer_name?.trim()||body.customer_name.trim().length<2||body.tx_type!=='sale'||!validAmount(body.paid_amount)||Number(body.paid_amount)>total))throw new ApiError('Check the customer name and payment for this credit sale.',422);
  }
  const entry = await enqueueMovement(userId, body);
  if (navigator.onLine) { try { await syncOffline(); } catch (error) { if (error.status && error.status < 500 && ![408,429].includes(error.status)) throw error; } }
  const pending = (await queueItems(userId)).some(i => i.key === entry.key);
  return { queued: pending, clientOperationId: entry.payload.client_operation_id };
}
async function ledger(path,body){
 const userId=currentSession?.user?.id;
 if(!userId)throw new ApiError('Please sign in.',401);
 if(!navigator.onLine)throw new ApiError('Connect to refresh customer balances before recording payments.',0);
 const profile=await readCache(userId,'/api/me');
 if(!verifiedCacheMatches(currentSession,profile?.value?.user))throw new ApiError('Connect and verify your account before recording customer balances.',403);
 if((await queueItems(userId)).some(i=>i.status==='conflict'))throw new ApiError('Review the waiting change first.',409);
 const entry=await enqueueMovement(userId,body);
 try{await syncOffline();}catch(e){if(e.status&&e.status<500&&![408,429].includes(e.status))throw e;}
 return {queued:(await queueItems(userId)).some(i=>i.key===entry.key),clientOperationId:entry.payload.client_operation_id};
}
export const api = {
  get: path => request(path),
  post: (path, body) => ['/api/inventory/movement','/api/inventory/batch'].includes(path) ? movement(body,path.endsWith('/batch')) : ['/api/debts','/api/debts/payment'].includes(path)?ledger(path,body): request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: path=>request(path,{method:'DELETE'}),
  photo:async path=>{const userId=currentSession?.user?.id;if(!userId)throw new ApiError('Please sign in.',401);try{if(!navigator.onLine)throw new ApiError('Offline',0);const blob=await networkRequest(path,{responseType:'image'});if(userId===currentSession?.user?.id)await saveCache(userId,path,blob);return blob;}catch(e){if(!e.status){const cached=await readCache(userId,path);if(cached)return cached.value;}throw e;}},
  download: async path => {
    const blob = await request(path, { responseType: 'blob' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;const reportUrl=new URL(path,location.origin),filename=reportUrl.pathname.split('/').pop()||'partcast-report.xlsx',from=reportUrl.searchParams.get('from'),to=reportUrl.searchParams.get('to');a.download=(from||to)?filename.replace(/\.xlsx$/,`-${from||'start'}-${to||'latest'}.xlsx`):filename;
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
