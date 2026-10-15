import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {default:router}=await import('../src/routes/api.js');
const {default:express}=await import('express');
const {errorHandler}=await import('../src/middleware/error.js');

test('forecast readiness protects writes, checks per-part history, and trains fewer than 30 observed-event fixture rows',async()=>{
 const original={from:adminDb.from,getUser:adminDb.auth.getUser,storageFrom:adminDb.storage.from};
 const sid='77777777-7777-4777-8777-777777777777',user='11111111-1111-4111-8111-111111111111',part='33333333-3333-4333-8333-333333333333';
 const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.test-signature';
 const origin=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
 const day=offset=>{const d=new Date(origin+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-offset);return d.toISOString().slice(0,10);};
 const row=offset=>({product_id:part,occurred_on:day(offset),quantity:1,source:'actual_sale',product:{part_number:'TEST-001',description:'Test fixture only'}});
 let rows=[],role='owner',verified=true;
 const writes=[],uploads=[],sourceFilters=[];
 adminDb.auth.getUser=async()=>({data:{user:{id:user,email:'test@example.test'}}});
 adminDb.from=table=>{
  let inserted;
  return {
   select(){return this;},eq(){return this;},order(){return this;},
   in(key,values){sourceFilters.push(values);return this;},
   range:async()=>{assert.equal(table,'demand_observations');return {data:rows,error:null};},
   single:async()=>({data:table==='profiles'?{id:user,active:true,role}:inserted,error:null}),
   maybeSingle:async()=>({data:verified?{expires_at:'2099-01-01T00:00:00Z'}:null}),
   insert(value){inserted=value;writes.push({table,operation:'insert',value});return this;},
   update(value){writes.push({table,operation:'update',value});return this;},
   then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject);}
  };
 };
 adminDb.storage.from=()=>({upload:async(path,buffer)=>{uploads.push({path,model:JSON.parse(buffer.toString())});return {error:null};}});
 const app=express();app.use(express.json());app.use('/api',authenticate,router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/forecast`,headers={Authorization:`Bearer ${token}`,'content-type':'application/json'};
 const train=()=>fetch(base+'/train',{method:'POST',headers,body:JSON.stringify({horizonDays:7})});
 try {
  assert.equal((await fetch(base+'/readiness')).status,401);
  role='cashier';assert.equal((await fetch(base+'/readiness',{headers})).status,403);role='owner';
  verified=false;assert.equal((await fetch(base+'/readiness',{headers})).status,428);verified=true;
  let response=await fetch(base+'/readiness',{headers});assert.equal((await response.json()).status,'no_observations');
  rows=Array.from({length:40},()=>row(0));
  response=await train();assert.equal(response.status,422);
  let body=await response.json();assert.equal(body.code,'FORECAST_DATA_NOT_READY');assert.equal(body.readiness.products[0].sale_days,1);
  assert.equal(writes.length,0);assert.equal(uploads.length,0);
  rows=[160,140,120,100,90].map(row);
  response=await fetch(base+'/readiness',{headers});body=await response.json();assert.equal(body.status,'stale_history');assert.equal(body.products[0].part_number,'TEST-001');
  assert.equal((await train()).status,422);assert.equal(writes.length,0);
  rows=[70,50,30,10,0].map(row);
  response=await fetch(base+'/readiness',{headers});body=await response.json();assert.equal(body.ready,true);assert.equal(body.record_count,5);
  assert(sourceFilters.every(values=>!values.includes('legacy_transaction_proxy')));
  response=await train();assert.equal(response.status,200);body=await response.json();assert.equal(body.forecastCount,7);
  assert.equal(uploads.length,1);assert(uploads[0].model.learner);
  assert(writes.some(write=>write.table==='forecast_runs'&&write.value.status==='completed'));
  assert(writes.every(write=>!['products','demand_observations','inventory_transactions'].includes(write.table)));
 } finally {adminDb.from=original.from;adminDb.auth.getUser=original.getUser;adminDb.storage.from=original.storageFrom;await new Promise(resolve=>server.close(resolve));}
});
