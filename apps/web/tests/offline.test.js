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
