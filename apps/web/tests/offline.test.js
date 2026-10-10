import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveCache,readCache,enqueueMovement,queueItems,clearAccount,drainQueue,projectedProducts,removeQueued } from '../src/lib/offline.js';
import { answerLocally } from '../src/lib/localAssistant.js';

test('account isolation, offline queue and duplicate-safe retries',async()=>{
 await saveCache('alice','/api/me',{user:{active:true}});
 assert.equal(await readCache('bob','/api/me'),null);
 const a=await enqueueMovement('alice',{product_id:'part-a',tx_type:'sale',quantity:2});
 await enqueueMovement('bob',{product_id:'part-a',tx_type:'sale',quantity:1});
 assert.equal((await queueItems('alice')).length,1);
 assert.equal(projectedProducts([{id:'part-a',current_stock:5,minimum_stock:2}],await queueItems('alice'))[0].current_stock,3);
 let attempts=[];
 await assert.rejects(drainQueue('alice',async payload=>{attempts.push(payload.client_operation_id);throw new TypeError('connection lost after commit');}));
 assert.equal((await queueItems('alice')).length,1);
 await drainQueue('alice',async payload=>{attempts.push(payload.client_operation_id);});
 assert.deepEqual(attempts,[a.payload.client_operation_id,a.payload.client_operation_id]);
 assert.equal((await queueItems('alice')).length,0);
 await clearAccount('bob');assert.equal((await queueItems('bob')).length,0);
 assert.ok(await readCache('alice','/api/me'));
});
test('conflicts pause later transactions; expired authentication retains unsent work',async()=>{
 const a=await enqueueMovement('staff',{product_id:'part-a',tx_type:'sale',quantity:9});
 await enqueueMovement('staff',{product_id:'part-a',tx_type:'stock_in',quantity:10});
 const conflict=Object.assign(new Error('Insufficient stock'),{status:409});
 await assert.rejects(drainQueue('staff',async()=>{throw conflict;}));
 assert.equal((await queueItems('staff'))[0].status,'conflict');
 let calls=0;await drainQueue('staff',async()=>{calls++;});assert.equal(calls,0);
 await removeQueued(a.key);
 await assert.rejects(drainQueue('staff',async()=>{throw Object.assign(new Error('Please sign in'),{status:401});}));
 assert.equal((await queueItems('staff'))[0].status,'pending');
 await clearAccount('staff');assert.equal((await queueItems('staff')).length,0);
});
test('local assistant gives saved facts with source age and no invented numbers',async()=>{
 assert.match((await answerLocally('how do I record a sale','alice',true)).answer,/choose Sell/);
 assert.equal(await answerLocally('Which parts are low stock?','alice',true),null);
 await saveCache('alice','/api/offline-snapshot',{products:[{id:'part-a',part_number:'A-1',description:'Brake pad',current_stock:2,minimum_stock:3,unit:'pcs',selling_price:500}]});
 const result=await answerLocally('low stock','alice',false);
 assert.match(result.answer,/Saved inventory/);assert.match(result.answer,/2 pcs/);
 assert.match((await answerLocally('low stock','bob',false)).answer,/No inventory is saved/);
 await clearAccount('alice');assert.equal(await readCache('alice','/api/me'),null);
});

test('fractional offline sales leave the remaining quantity available without floating-point drift',async()=>{
 const first=await enqueueMovement('fractional-staff',{product_id:'fractional-part',tx_type:'sale',quantity:0.1});
 const products=[{id:'fractional-part',current_stock:0.3,minimum_stock:0}];
 const remaining=projectedProducts(products,await queueItems('fractional-staff'))[0];
 assert.equal(remaining.current_stock,0.2);
 await enqueueMovement('fractional-staff',{product_id:'fractional-part',tx_type:'sale',quantity:0.2});
 const soldOut=projectedProducts(products,await queueItems('fractional-staff'))[0];
 assert.equal(soldOut.current_stock,0);assert.equal(soldOut.stock_status,'out');
 await removeQueued(first.key);await clearAccount('fractional-staff');
});

test('offline baskets project every line and retry one stable operation ID',async()=>{
 await enqueueMovement('basket-staff',{kind:'batch',tx_type:'sale',is_credit:true,lines:[{product_id:'a',quantity:0.2,unit_price:100},{product_id:'b',quantity:2,unit_price:10}]});
 const rows=projectedProducts([{id:'a',current_stock:0.3,minimum_stock:0},{id:'b',current_stock:5,minimum_stock:1}],await queueItems('basket-staff'));
 assert.deepEqual(rows.map(r=>r.current_stock),[0.1,3]);let first;
 await assert.rejects(drainQueue('basket-staff',async p=>{first=p;throw Object.assign(new Error('Offline'),{status:0});}));
 await drainQueue('basket-staff',async p=>assert.deepEqual(p,first));await clearAccount('basket-staff');
});
test('Tagalog terminology finds saved parts and distinguishes related cooling components',async()=>{
 await saveCache('terms-staff','/api/offline-snapshot',{products:[{id:'oil',description:'Engine oil',part_number:'OIL1',current_stock:2,minimum_stock:0,unit:'bottles',selling_price:250}]});
 const oil=await answerLocally('Magkano ang langis ng makina?','terms-staff',false,'fil');assert.match(oil.answer,/250.00/);assert.match(oil.answer,/Engine oil/);
 const cooling=await answerLocally('Pareho ba coolant at radiator?','terms-staff',true,'fil');assert.match(cooling.answer,/magkaibang produkto/);assert.equal(cooling.mode,'local');
 await clearAccount('terms-staff');
});
test('basket amounts use decimal cent arithmetic instead of binary product rounding',async()=>{
 const {lineCents}=await import('../src/lib/store.js');assert.equal(lineCents(19.9,1.05),2090);assert.equal(lineCents(0.1,0.15),2);assert.ok(Number.isNaN(lineCents(1e308,1)));assert.ok(Number.isNaN(lineCents(-1,10)));
});
test('Tagalog availability questions preserve part numbers and fluid names exclude radiator components',async()=>{
 const {normalizeQuestion,productTerms}=await import('../src/lib/partTerms.js');assert.match(normalizeQuestion('May BP-001 ba tayo?'),/bp-001/);assert.equal(normalizeQuestion('Ilang BP-001?'),'quantity bp-001?');assert.equal(normalizeQuestion('Nasaan BP-001?'),'where bp-001?');assert.ok(!productTerms('Magkano radiator fluid?').includes('radiyador'));
 await saveCache('availability-staff','/api/offline-snapshot',{products:[{id:'p',part_number:'BP-001',description:'Brake pad',current_stock:3,minimum_stock:1,unit:'pcs'}]});
 assert.match((await answerLocally('May BP-001 ba tayo?','availability-staff',false,'fil')).answer,/3 pcs/);await clearAccount('availability-staff');
});

test('retrying an existing outbox entry preserves its order and rejects changed content',async()=>{
 const payload={kind:'batch',tx_type:'sale',lines:[{product_id:'a',quantity:1,unit_price:100}]};
 const first=await enqueueMovement('retry-staff',payload);
 const second=await enqueueMovement('retry-staff',{product_id:'b',tx_type:'stock_in',quantity:2});
 const retried=await enqueueMovement('retry-staff',{...first.payload,lines:[{unit_price:100,quantity:1,product_id:'a'}]});
 assert.equal(retried.createdAt,first.createdAt);assert.deepEqual((await queueItems('retry-staff')).map(e=>e.key),[first.key,second.key]);
 await assert.rejects(enqueueMovement('retry-staff',{...first.payload,lines:[{product_id:'a',quantity:2,unit_price:100}]}),/different change/);
 assert.equal((await queueItems('retry-staff')).length,2);await clearAccount('retry-staff');
});

test('quantity and price validation rejects blank, boolean and nonnumeric values',async()=>{
 const {validAmount}=await import('../src/lib/store.js');
 for(const value of ['', ' ', null, true, false, {}, [], Infinity, 1e308, -1, 0.001])assert.equal(validAmount(value),false);
 for(const value of [0,'0',0.29,'19.9',999.99])assert.equal(validAmount(value),true);
 assert.equal(validAmount(0,true),false);assert.equal(validAmount('0.01',true),true);
});
