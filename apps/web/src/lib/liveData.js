const listeners = new Set();
let broadcast = null;

export const LIVE_TABLES = [
  'forecast_refresh_state', 'products', 'inventory_transactions', 'demand_observations', 'legacy_sales',
  'forecast_runs', 'suppliers', 'product_suppliers', 'import_batches',
  'profiles', 'audit_logs', 'backup_logs', 'supplier_email_logs', 'system_settings', 'customer_debts', 'debt_payments'
];

export function subscribeToData(tables, listener) {
  const entry = { tables, listener };
  listeners.add(entry);
  return () => listeners.delete(entry);
}

export function invalidateData(tables = LIVE_TABLES, notifyTabs = true) {
  for (const entry of listeners) {
    if (entry.tables.some(table => tables.includes(table))) entry.listener();
  }
  if (notifyTabs) broadcast?.(tables);
}

export function mutationTables(path) {
  if (path.startsWith('/api/assistant/')) return [];
  if (path.startsWith('/api/debts')) return ['customer_debts','debt_payments'];
  if (path.startsWith('/api/imports')) return ['products', 'inventory_transactions', 'demand_observations', 'legacy_sales', 'import_batches','forecast_refresh_state'];
  if (path.startsWith('/api/forecast/train')||path.startsWith('/api/forecast/automation')) return ['forecast_refresh_state'];
  if (path.includes('/suppliers')) return ['suppliers', 'product_suppliers'];
  if (path.startsWith('/api/products') || path.startsWith('/api/inventory/')) return ['products', 'inventory_transactions', 'demand_observations','forecast_refresh_state'];
  if (path.startsWith('/api/admin/backups')) return ['backup_logs'];
  if (path.startsWith('/api/admin/settings')) return ['system_settings'];
  if (path.startsWith('/api/admin/users') || path === '/api/me') return ['profiles', 'audit_logs'];
  return [];
}

// One authenticated connection per tab. Messages contain invalidations only;
// each page reloads authorized data from the API instead of trusting row payloads.
export function startLiveData(client, userId, browser = window, doc = document) {
  const key = `partcast-data:${userId}`;
  let channel;
  try { channel = new browser.BroadcastChannel(key); } catch { /* storage fallback below */ }
  const receive = tables => {
    if (Array.isArray(tables)) invalidateData(tables.filter(t => LIVE_TABLES.includes(t)), false);
  };
  if (channel) channel.onmessage = event => receive(event.data);
  const send = tables => {
    if (channel) {
      try { channel.postMessage(tables); return; } catch { /* storage fallback below */ }
    }
    try { browser.localStorage.setItem(key, JSON.stringify({ tables, nonce: Math.random() })); } catch { /* unavailable storage */ }
  };
  broadcast = send;
  const onStorage = event => {
    if (event.key !== key || !event.newValue) return;
    try { receive(JSON.parse(event.newValue).tables); } catch { /* ignore unrelated/invalid messages */ }
  };
  const refresh = () => invalidateData(LIVE_TABLES, false);
  const onVisible = () => { if (doc.visibilityState === 'visible') refresh(); };
  browser.addEventListener('storage', onStorage);
  browser.addEventListener('online', refresh);
  browser.addEventListener('focus', refresh);
  doc.addEventListener('visibilitychange', onVisible);
  let realtime = client.channel(`partcast-data-${userId}`);
  for (const table of LIVE_TABLES) {
    realtime = realtime.on('postgres_changes', { event: '*', schema: 'public', table }, () => invalidateData([table], false));
  }
  realtime.subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
  // Recover missed events or a temporarily unavailable Realtime connection.
  const timer = browser.setInterval(onVisible, 60000);
  return () => {
    browser.clearInterval(timer);
    browser.removeEventListener('storage', onStorage);
    browser.removeEventListener('online', refresh);
    browser.removeEventListener('focus', refresh);
    doc.removeEventListener('visibilitychange', onVisible);
    channel?.close();
    if (broadcast === send) broadcast = null;
    client.removeChannel(realtime);
  };
}
