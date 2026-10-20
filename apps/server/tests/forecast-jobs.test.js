import {test} from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env,{PARTCAST_DEMO_MODE:'false',SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {trainForecast}=await import('../src/routes/jobs.js');

test('scheduled forecast reads same-day observations in a stable order and stops when its run record cannot be created',async()=>{
 const previous={from:adminDb.from,storage:adminDb.storage.from};
 const rows=Array.from({length:1001},(_,index)=>({product_id:`part-${index}`,occurred_on:'2026-01-01',quantity:1,source:'actual_sale'}));
 const queries=[],runs=[],failure=new Error('The forecast run could not be saved.');let unexpectedWrites=0;
 adminDb.from=table=>{
  if(table==='forecast_runs')return {insert:async data=>{runs.push(data);return {data:null,error:failure};},update(){unexpectedWrites++;throw new Error('A missing run must not be updated.');}};
  assert.equal(table,'demand_observations');const query={order:[],source:null,range:null};queries.push(query);
  return {select(){return this;},in(column,values){assert.equal(column,'source');query.source=values;return this;},order(column){query.order.push(column);return this;},range(from,to){query.range=[from,to];return Promise.resolve({data:rows.slice(from,to+1),error:null});}};
 };
 adminDb.storage.from=()=>{unexpectedWrites++;throw new Error('Models must not be uploaded without a saved forecast run.');};
 try{
  await assert.rejects(trainForecast({horizonDays:30}),error=>error===failure);
  assert.equal(runs.length,1);assert.equal(runs[0].training_rows,1001);assert.equal(runs[0].status,'running');
  assert.equal(unexpectedWrites,0);
  assert.deepEqual(queries.map(query=>query.range),[[0,999],[1000,1999]]);
  for(const query of queries){assert.deepEqual(query.order,['occurred_on','id']);assert.deepEqual(query.source,['actual_sale','imported_training_data']);}
 }finally{adminDb.from=previous.from;adminDb.storage.from=previous.storage;}
});

test('scheduled forecast with too few observations does not create or upload a run',async()=>{
 const previous={from:adminDb.from,storage:adminDb.storage.from};let writes=0;
 adminDb.from=table=>{
  assert.equal(table,'demand_observations');
  return {select(){return this;},in(){return this;},order(){return this;},range:async()=>({data:[],error:null})};
 };
 adminDb.storage.from=()=>{writes++;throw new Error('No forecast should be uploaded.');};
 try{const result=await trainForecast({});assert.equal(result.skipped,true);assert.equal(writes,0);}
 finally{adminDb.from=previous.from;adminDb.storage.from=previous.storage;}
});
