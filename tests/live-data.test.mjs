import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidateData, subscribeToData, mutationTables, startLiveData, LIVE_TABLES } from '../apps/web/src/lib/liveData.js';
import { planningChart } from '../apps/web/src/lib/planning.js';
import { getProductPlanning } from '../apps/server/src/services/planning.js';

test('invalidates only affected views, and unsubscribes cleanly', () => {
  let products = 0, forecasts = 0;
  const stop = subscribeToData(['products'], () => products++);
  const stopForecasts = subscribeToData(['forecast_runs'], () => forecasts++);
  invalidateData(mutationTables('/api/inventory/movement'));
  assert.equal(products, 1);
  assert.equal(forecasts, 0);
  stop(); stopForecasts();
  invalidateData(['products']);
  assert.equal(products, 1);
  assert.deepEqual(mutationTables('/api/assistant/chat'), []);
  assert.ok(mutationTables('/api/imports/spreadsheet').includes('demand_observations'));
});

test('database events, cross-tab messages, reconnect recovery, polling and cleanup', () => {
  const browser = new EventTarget();
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  let messages = [], closed = false, removed = false, timer, cleared;
  class Channel {
    constructor() { browser.channel = this; }
    postMessage(tables) { messages.push(tables); }
    close() { closed = true; }
  }
  browser.BroadcastChannel = Channel;
  browser.setInterval = fn => { timer = fn; return 23; };
  browser.clearInterval = id => { cleared = id; };
  const handlers = {};
  let subscribed;
  const realtime = {
    on(type, filter, fn) { assert.equal(type, 'postgres_changes'); handlers[filter.table] = fn; return this; },
    subscribe(fn) { subscribed = fn; return this; }
  };
  const client = { channel: () => realtime, removeChannel: ch => { assert.equal(ch, realtime); removed = true; } };
  let refreshes = 0;
  const unsubscribe = subscribeToData(['products'], () => refreshes++);
  const stop = startLiveData(client, 'test-user', browser, doc);
  assert.deepEqual(Object.keys(handlers), LIVE_TABLES);
  handlers.products();
  assert.equal(refreshes, 1);
  assert.equal(messages.length, 0); // Database events must not echo across tabs.
  invalidateData(['products']);
  assert.deepEqual(messages, [['products']]);
  browser.channel.onmessage({ data: ['products'] });
  assert.equal(refreshes, 3);
  assert.equal(messages.length, 1); // Cross-tab messages must not loop.
  subscribed('SUBSCRIBED');
  browser.dispatchEvent(new Event('online'));
  browser.dispatchEvent(new Event('focus'));
  timer();
  assert.equal(refreshes, 7);
  doc.visibilityState = 'hidden'; timer();
  assert.equal(refreshes, 7);
  stop();
  browser.dispatchEvent(new Event('focus'));
  invalidateData(['products']);
  assert.equal(messages.length, 1);
  assert.ok(closed && removed);
  assert.equal(cleared, 23);
  unsubscribe();
});

test('storage fallback receives invalidations when BroadcastChannel is unavailable', () => {
  const browser = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = 'visible';
  let saved;
  browser.localStorage = { setItem: (key, value) => { saved = { key, value }; } };
  browser.setInterval = () => 1; browser.clearInterval = () => {};
  const realtime = { on() { return this; }, subscribe() {} };
  const stop = startLiveData({ channel: () => realtime, removeChannel() {} }, 'user', browser, doc);
  let changes = 0;
  const unsub = subscribeToData(['products'], () => changes++);
  invalidateData(['products']);
  assert.equal(saved.key, 'partcast-data:user');
  const event = new Event('storage');
  Object.assign(event, { key: saved.key, newValue: saved.value });
  browser.dispatchEvent(event);
  assert.equal(changes, 2);
  stop(); unsub();
});

test('sales and restocking change the actual and projected lines without modifying model predictions', () => {
  const baseline = { today:'2026-10-30', product:{current_stock:10}, actualSales:[{occurred_on:'2026-10-30',quantity:2},{occurred_on:'2026-10-30',quantity:3}], data:[{forecast_date:'2026-10-31',predicted_quantity:4},{forecast_date:'2026-11-01',predicted_quantity:8}] };
  const initial = planningChart(baseline);
  assert.equal(initial.length, 32);
  assert.equal(initial[0].actual_quantity, 0);
  assert.equal(initial[29].actual_quantity, 5);
  assert.deepEqual(initial.slice(29).map(r=>r.projected_stock), [10,6,0]);
  const restocked = planningChart({...baseline,product:{current_stock:20}});
  assert.deepEqual(restocked.slice(29).map(r=>r.projected_stock), [20,16,8]);
  assert.equal(restocked[30].predicted_quantity, initial[30].predicted_quantity);
  const sale = planningChart({...baseline,product:{current_stock:8},actualSales:[...baseline.actualSales,{occurred_on:'2026-10-30',quantity:2}]});
  assert.equal(sale[29].actual_quantity, 7);
  assert.equal(sale[29].projected_stock, 8);
  assert.equal(planningChart({...baseline,data:[]}).length, 30);
  assert.deepEqual(planningChart(null), []);
});

function fakeDb(latest, forecastError = null) {
  const calls = [];
  const db = { from(table) {
    const filters = [];
    const builder = new Proxy({}, { get(_target, method) {
      if (method === 'then') return resolve => {
        calls.push({table,filters});
        if (table === 'products') return resolve({data:{id:'part',current_stock:12}});
        if (table === 'latest_completed_forecast_run') return resolve({data:latest});
        if (table === 'demand_observations') return resolve({data:[{occurred_on:'2026-10-30',quantity:2}]});
        return resolve({data:[{forecast_date:'2026-10-31',predicted_quantity:3,run_id:'latest'}],error:forecastError});
      };
      return (...args) => { filters.push([method,...args]); return builder; };
    }});
    return builder;
  }};
  return {db,calls};
}

test('planning API queries only the latest completed run and real sale observations', async () => {
  const {db,calls} = fakeDb({id:'latest'});
  const result = await getProductPlanning(db, 'part', '2026-10-30');
  assert.equal(result.product.current_stock, 12);
  assert.equal(result.actualSales.length, 1);
  const forecasts = calls.find(c=>c.table==='demand_forecasts');
  assert.ok(forecasts.filters.some(f=>f[0]==='eq' && f[1]==='run_id' && f[2]==='latest'));
  const observations = calls.find(c=>c.table==='demand_observations');
  assert.ok(observations.filters.some(f=>f[0]==='eq' && f[1]==='source' && f[2]==='actual_sale'));
});

test('products without a trained model still return live stock and sales', async () => {
  const {db,calls} = fakeDb(null);
  const result = await getProductPlanning(db, 'part', '2026-10-30');
  assert.deepEqual(result.data, []);
  assert.equal(result.product.current_stock, 12);
  assert.ok(!calls.some(c=>c.table==='demand_forecasts'));
});

test('planning API propagates database errors instead of showing an empty chart', async () => {
  const error = new Error('database unavailable');
  const {db} = fakeDb({id:'latest'}, error);
  await assert.rejects(getProductPlanning(db, 'part', '2026-10-30'), /database unavailable/);
});
