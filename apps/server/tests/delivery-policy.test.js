import {test} from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {enforceDeliveryLimit,MAX_DELIVERY_QUANTITY}=await import('../src/utils/deliveryPolicy.js');
const {batchSchema}=await import('../src/utils/storeValidation.js');
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',operation='44444444-4444-4444-8444-444444444444',part='33333333-3333-4333-8333-333333333333';
const delivery=quantity=>({kind:'batch',tx_type:'stock_in',lines:[{product_id:part,quantity,unit_price:100}],is_credit:false,paid_amount:0});

test('delivery limits allow up to 100 whole units per part and preserve sale and ledger rules',async()=>{
 const previous=adminDb.from;adminDb.from=()=>assert.fail('Valid deliveries and other operations need no receipt lookup.');
 try{
  assert.equal(MAX_DELIVERY_QUANTITY,100);
  for(const quantity of [1,2,3,5,10,100])assert.equal(await enforceDeliveryLimit(user,operation,delivery(quantity)),null);
  assert.equal(await enforceDeliveryLimit(user,operation,{...delivery(1000),tx_type:'sale'}),null);
  assert.equal(await enforceDeliveryLimit(user,operation,{kind:'debt',principal:1000}),null);
 }finally{adminDb.from=previous;}
});

test('a new oversized or fractional delivery is refused as a whole before any stock mutation',async()=>{
 const previous=adminDb.from;let reads=0;
 adminDb.from=table=>{assert.equal(table,'business_sync_receipts');return {select(){return this;},eq(){return this;},maybeSingle:async()=>{reads++;return {data:null,error:null};}};};
 try{
  for(const quantity of [101,1000,0.5,1.5])await assert.rejects(enforceDeliveryLimit(user,operation,{...delivery(1),lines:[...delivery(1).lines,{product_id:other,quantity,unit_price:0}]}),error=>error.status===422&&error.safe===true&&error.message==='Receive a maximum of 100 units per item.');
  assert.equal(reads,4);
 }finally{adminDb.from=previous;}
});

test('only an exact existing delivery receipt can replay older quantities for the same user and operation',async()=>{
 const previous=adminDb.from,payload=delivery(1000),result={batchId:other,total:100000};let unavailable=false;
 adminDb.from=table=>{
  assert.equal(table,'business_sync_receipts');const filters={};
  return {select(){return this;},eq(key,value){filters[key]=value;return this;},maybeSingle:async()=>unavailable?{error:new Error('Receipt storage unavailable')}:{data:filters.user_id===user&&filters.operation_id===operation?{payload,result}:null,error:null}};
 };
 try{
  assert.deepEqual((await enforceDeliveryLimit(user,operation,payload)).result,result);
  for(const [uid,id,body] of [[other,operation,payload],[user,other,payload],[user,operation,delivery(999)],[user,operation,{...payload,notes:'changed'}]])await assert.rejects(enforceDeliveryLimit(uid,id,body),error=>error.status===422);
  unavailable=true;await assert.rejects(enforceDeliveryLimit(user,operation,payload),/Receipt storage unavailable/);
 }finally{adminDb.from=previous;}
});

test('the HTTP delivery route enforces the cap before RPC while preserving exact historical retries',async()=>{
 const {default:express}=await import('express');
 const {default:router}=await import('../src/routes/store.js');
 const {errorHandler}=await import('../src/middleware/error.js');
 const previous={from:adminDb.from,fetch:globalThis.fetch};let uid=user,role='owner',saved=null,audits=0;const writes=[];
 adminDb.from=table=>{
  if(table==='audit_logs')return {insert:async()=>{audits++;return {error:null};}};
  assert.equal(table,'business_sync_receipts');const filters={};return {select(){return this;},eq(key,value){filters[key]=value;return this;},maybeSingle:async()=>({data:saved&&filters.user_id===user&&filters.operation_id===operation?saved:null,error:null})};
 };
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='http://127.0.0.1:9/rest/v1/rpc/sync_store_operation'){
   writes.push(JSON.parse(options.body));assert.equal(new Headers(options.headers).get('authorization'),'Bearer fixture-staff-token');return new Response(JSON.stringify({batchId:other,total:200}),{headers:{'content-type':'application/json'}});
  }
  return previous.fetch(url,options);
 };
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:uid,role,accessToken:'fixture-staff-token'};next();});app.use('/api',router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const post=body=>previous.fetch(`http://127.0.0.1:${server.address().port}/api/inventory/batch`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_operation_id:operation,...body})});
 try{
  for(const quantity of [101,1000]){const response=await post(delivery(quantity));assert.equal(response.status,422);assert.match((await response.json()).error,/maximum of 100/);}
  assert.equal(writes.length,0);assert.equal(audits,0);
  assert.equal((await post(delivery(100))).status,201);assert.equal(writes.length,1);assert.equal(writes[0].p_payload.lines[0].quantity,100);
  const {client_operation_id,...payload}=batchSchema.parse({client_operation_id:operation,...delivery(1000)});saved={payload,result:{batchId:operation,total:100000}};
  let response=await post(delivery(1000));assert.equal(response.status,201);assert.deepEqual(await response.json(),saved.result);assert.equal(writes.length,1);assert.equal(audits,1);
  assert.equal((await post(delivery(999))).status,422);uid=other;assert.equal((await post(delivery(1000))).status,422);uid=user;
  role='viewer';assert.equal((await post(delivery(2))).status,403);assert.equal(writes.length,1);
 }finally{await new Promise(resolve=>server.close(resolve));adminDb.from=previous.from;globalThis.fetch=previous.fetch;}
});
