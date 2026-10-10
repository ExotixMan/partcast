// Account-scoped storage. Never store access tokens, passwords or service keys here.
const DB_NAME = 'partcast-offline-v1';
export const OFFLINE_MAX_AGE = 12 * 60 * 60 * 1000;
let database;
export const changed = () => globalThis.dispatchEvent?.(new Event('partcast:offline'));

function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('cache', { keyPath: 'key' });
      req.result.createObjectStore('queue', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { database = null; reject(req.error); };
  });
  return database;
}

async function transaction(store, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Local storage failed.'));
  });
}

export async function saveCache(userId, path, value) {
  await transaction('cache', 'readwrite', s => s.put({ key: `${userId}:${path}`, userId, path, value, savedAt: Date.now() }));
  changed();
}
export async function readCache(userId, path) {
  const entry = await transaction('cache', 'readonly', s => s.get(`${userId}:${path}`));
  return entry && Date.now() - entry.savedAt < OFFLINE_MAX_AGE ? entry : null;
}
export async function queueItems(userId) {
  const entries = await transaction('queue', 'readonly', s => s.getAll());
  return entries.filter(e => e.userId === userId).sort((a,b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
}
export async function enqueueMovement(userId, payload) {
  const id = payload.client_operation_id || crypto.randomUUID();
  const db = await open();
  const entry = await new Promise((resolve,reject) => {
    const tx = db.transaction('queue','readwrite'), store = tx.objectStore('queue');
    let next;
    const all=store.getAll();
    all.onsuccess=()=>{
      const existing=all.result.find(e=>e.key===`${userId}:${id}`);
      const normalized={...payload,client_operation_id:id,occurred_at:payload.occurred_at||existing?.payload.occurred_at||new Date().toISOString()};
      if(existing){
        const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
        if(JSON.stringify(stable(existing.payload))!==JSON.stringify(stable(normalized))){reject(Object.assign(new Error('This operation ID is already used for a different change.'),{status:409}));tx.abort();return;}
        next=existing;return;
      }
      const createdAt=Math.max(Date.now(),...all.result.filter(e=>e.userId===userId).map(e=>e.createdAt+1));
      next={key:`${userId}:${id}`,userId,payload:normalized,createdAt,status:'pending'};
      store.put(next);
    };
    tx.oncomplete=()=>resolve(next);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  changed();globalThis.dispatchEvent?.(new Event('partcast:queue'));
  return entry;
}
export async function updateQueued(entry, error) {
  await transaction('queue', 'readwrite', s => s.put({ ...entry, status: 'conflict', error }));
  changed();
}
export async function removeQueued(key) {
  await transaction('queue', 'readwrite', s => s.delete(key));
  changed();globalThis.dispatchEvent?.(new Event('partcast:queue'));
}
export async function clearAccount(userId) {
  for (const store of ['cache', 'queue']) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const s = tx.objectStore(store), cursor = s.openCursor();
      cursor.onsuccess = () => { const c = cursor.result; if (c) { if (c.value.userId === userId) c.delete(); c.continue(); } };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }
  changed();
}

export function projectedProducts(products, queue) {
  return products.map(product => {
    const movements = queue.filter(e => e.status === 'pending').flatMap(e => (e.payload.lines || [e.payload]).filter(l=>l.product_id===product.id).map(l=>({payload:{...l,tx_type:e.payload.tx_type}})));
    // Match PostgreSQL's two-decimal stock quantities without binary subtraction drift.
    const delta = movements.reduce((sum,e) => sum + (e.payload.tx_type === 'stock_in' ? 1 : -1) * Math.round(Number(e.payload.quantity) * 100), 0);
    const stock = (Math.round(Number(product.current_stock) * 100) + delta) / 100;
    return { ...product, current_stock: stock, pending: movements.length, stock_status: stock <= 0 ? 'out' : stock <= Number(product.minimum_stock) ? 'low' : 'ok' };
  });
}

// Stop at the first conflict: later movements may depend on the rejected one.
export async function drainQueue(userId, send) {
  const entries = await queueItems(userId);
  for (const entry of entries) {
    if (entry.status === 'conflict') break;
    try { await send(entry.payload); await removeQueued(entry.key); }
    catch (error) {
      if (error.status >= 400 && error.status < 500 && ![401,403,408,429].includes(error.status)) await updateQueued(entry, error.message);
      throw error;
    }
  }
}
