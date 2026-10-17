import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRecordedSales} from '../src/utils/recordedSales.js';

const asOfDate='2026-10-17';
const row=(occurred_on,quantity,source='actual_sale',product_id='part-a')=>({product_id,occurred_on,quantity,source,product:{part_number:product_id==='part-a'?'FILTER-001':'OIL-002',description:'Fixture only',unit:product_id==='part-a'?null:'L'}});

test('recorded sales preserve exact quantities, distinct sale days and source counts without filling gaps',()=>{
  const observations=[row('2024-01-15',2),row('2026-10-12','1.25'),row('2026-10-12','0.75','imported_training_data'),
    row('2026-10-10',0.1,'actual_sale','part-b'),row('2026-10-10',0.2,'imported_training_data','part-b'),
    row('2026-10-13',100,'legacy_transaction_proxy'),row('2026-10-14',999,'synthetic_simulated')];
  const original=structuredClone(observations);
  const result=summarizeRecordedSales(observations,{asOfDate});
  assert.equal(result.record_count,5);assert.equal(result.part_count,2);
  assert.deepEqual(result.source_counts,{actual_sale:3,imported_training_data:2});
  assert.equal(result.includes_forecasts,false);assert.equal(result.missing_days_filled,false);
  assert.equal(result.last_sale_date,'2026-10-12');
  assert.equal(result.data[0].recorded_quantity,4);assert.equal(result.data[0].sale_days,2);
  assert.equal(result.data[0].first_sale_date,'2024-01-15');assert.equal(result.data[0].unit,null);
  assert.equal(result.data[1].recorded_quantity,0.3);assert.equal(result.data[1].sale_days,1);assert.equal(result.data[1].unit,'L');
  assert.deepEqual(observations,original);
});

test('recorded date ranges include both endpoints and an empty period does not invent zero-sale rows',()=>{
  const observations=[row('2026-10-09',9),row('2026-10-10',2),row('2026-10-12',3),row('2026-10-13',4)];
  const result=summarizeRecordedSales(observations,{from:'2026-10-10',to:'2026-10-12',asOfDate});
  assert.equal(result.record_count,2);assert.equal(result.data[0].recorded_quantity,5);assert.equal(result.data[0].sale_days,2);
  const empty=summarizeRecordedSales(observations,{from:'2026-10-11',to:'2026-10-11',asOfDate});
  assert.equal(empty.record_count,0);assert.deepEqual(empty.data,[]);assert.equal(empty.last_sale_date,null);
  assert.throws(()=>summarizeRecordedSales(observations,{from:'2026-10-12',to:'2026-10-10',asOfDate}),e=>e.status===422);
  assert.throws(()=>summarizeRecordedSales(observations,{to:'2026-10-18',asOfDate}),e=>e.status===422);
});

test('invalid and future records are disclosed and never change recorded totals',()=>{
  const result=summarizeRecordedSales([row('2026-10-12',2),row('2026-10-18',99),row('2026-02-30',7),row('2026-10-12',true),row('2026-10-12',-1),row('2026-10-12',''),row('2026-10-12',0.12345)],{asOfDate});
  assert.equal(result.record_count,1);assert.equal(result.data[0].recorded_quantity,2);
  assert.equal(result.invalid_records,5);assert.equal(result.future_records,1);
});

test('HTTP recorded sales require verified manager access, reject invalid ranges before queries and never write',async()=>{
  Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
  const {adminDb}=await import('../src/supabase.js');
  const {authenticate}=await import('../src/middleware/auth.js');
  const {default:router}=await import('../src/routes/api.js');
  const {default:express}=await import('express');
  const {errorHandler}=await import('../src/middleware/error.js');
  const original={from:adminDb.from,auth:adminDb.auth.getUser};
  const user='11111111-1111-4111-8111-111111111111';
  const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:'77777777-7777-4777-8777-777777777777',amr:[{method:'password'}]})).toString('base64url')+'.fixture';
  let role='owner',verified=true,reads=0;const filters=[];
  adminDb.auth.getUser=async()=>({data:{user:{id:user,email:'fixture@example.test'}}});
  adminDb.from=table=>{
    assert(['profiles','login_verifications','demand_observations'].includes(table));
    return {select(){return this;},eq(){return this;},order(){return this;},
      in(column,values){filters.push(values);return this;},
      single:async()=>({data:{id:user,active:true,role},error:null}),
      maybeSingle:async()=>({data:verified?{expires_at:'2099-01-01T00:00:00Z'}:null,error:null}),
      range:async()=>{assert.equal(table,'demand_observations');reads++;return {data:[row('2020-01-01',5,'imported_training_data'),row('2020-01-02',2)],error:null};}};
  };
  const app=express();app.use(express.json());app.use('/api',authenticate,router);app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/forecast/recorded-sales`,headers={Authorization:'Bearer '+token};
  try {
    assert.equal((await fetch(base)).status,401);
    role='cashier';assert.equal((await fetch(base,{headers})).status,403);
    role='owner';verified=false;assert.equal((await fetch(base,{headers})).status,428);verified=true;
    assert.equal((await fetch(base+'?from=2020-01-02&to=2020-01-01',{headers})).status,422);
    assert.equal((await fetch(base+'?from=bad-date',{headers})).status,400);assert.equal(reads,0);
    assert.equal((await fetch(base.replace('/recorded-sales','/readiness')+'?includeProxy=true',{headers})).status,422);
    assert.equal((await fetch(base.replace('/recorded-sales','/train'),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({includeProxy:true})})).status,422);
    assert.equal(reads,0);
    const response=await fetch(base+'?from=2020-01-01&to=2020-01-02&includeProxy=true',{headers});
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.mode,'recorded_sales');
    assert.equal(body.record_count,2);assert.equal(body.data[0].recorded_quantity,7);assert.equal(body.includes_forecasts,false);
    assert(filters.every(values=>!values.includes('legacy_transaction_proxy')));
    role='super_admin';assert.equal((await fetch(base,{headers})).status,200);
  } finally {adminDb.from=original.from;adminDb.auth.getUser=original.auth;await new Promise(resolve=>server.close(resolve));}
});
