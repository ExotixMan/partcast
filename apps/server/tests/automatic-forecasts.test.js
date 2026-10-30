import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createForecastAutomation} from '../src/services/forecastAutomation.js';
import {createForecastTrainer} from '../src/services/forecastTraining.js';

async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create function public.current_app_role() returns text language sql as $$select 'owner'::text$$;
 create table forecast_runs(id uuid primary key,status text,model_version text,metrics jsonb,training_date_min date,training_date_max date,model_storage_path text,completed_at timestamptz,error_message text);
 create table demand_observations(id uuid primary key default gen_random_uuid(),product_id uuid,occurred_on date,quantity numeric,source text);
 create table system_settings(key text primary key,value jsonb);
 insert into system_settings values('forecast_horizon_days','30');
 create publication supabase_realtime;`);
 const sql=await readFile(new URL('../../../supabase/migrations/0014_automatic_forecasts.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 return db;
}
const state=async db=>(await db.query('select * from forecast_refresh_state')).rows[0];
async function due(db){await db.exec("update forecast_refresh_state set next_attempt_at=now()-interval '1 second'");}
async function claim(db){return (await db.query('select * from claim_forecast_refresh()')).rows[0];}
async function finish(db,token,outcome,result={}){return (await db.query('select finish_forecast_refresh($1,$2,$3::jsonb) ok',[token,outcome,JSON.stringify(result)])).rows[0].ok;}
async function sale(db,quantity=1){await db.query("insert into demand_observations(product_id,occurred_on,quantity,source) values('33333333-3333-4333-8333-333333333333',current_date,$1,'actual_sale')",[quantity]);}

// Exercise durable queue behavior with PostgreSQL, including two logical workers.
test('committed sales queue work; rollbacks, duplicate imports and stock receipts cannot invent demand',async()=>{
 const db=await database();
 try{
  const before=await state(db);await sale(db);assert.equal((await state(db)).requested_version,before.requested_version+1);
  await db.exec('begin');await sale(db);await db.exec('rollback');assert.equal((await state(db)).requested_version,before.requested_version+1);
  const n=(await state(db)).requested_version;
  await db.exec('update demand_observations set quantity=quantity');assert.equal((await state(db)).requested_version,n);
  await db.exec("insert into demand_observations(source,quantity) values('legacy_transaction_proxy',1)");assert.equal((await state(db)).requested_version,n);
  await db.exec("update demand_observations set quantity=quantity+1 where source='actual_sale'");assert.equal((await state(db)).requested_version,n+1);
  const funcs=await db.query("select event_object_table from information_schema.triggers where trigger_name='demand_forecast_refresh'");assert(funcs.rows.every(r=>r.event_object_table==='demand_observations'));
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select request_forecast_refresh()"),/permission denied/);
  await assert.rejects(db.query("select * from claim_forecast_refresh()"),/permission denied/);
  await assert.rejects(db.exec("update forecast_refresh_state set status='ready'"),/permission denied/);
  assert.equal((await db.query('select status from forecast_refresh_state')).rows.length,1);
 }finally{await db.close();}
});

test('two workers cannot claim one job; a sale during training creates exactly one follow-up',async()=>{
 const db=await database();
 try{
  await due(db);const first=await claim(db);assert(first.lock_token);assert.equal(await claim(db),undefined);
  const n=first.claimed_version;await sale(db);await sale(db);
  await db.query("insert into forecast_runs(id,status) values($1,'running')",[first.lock_token]);
  assert.equal(await finish(db,first.lock_token,'completed',{model_version:'v1',metrics:{mae:1},model_storage_path:'model'}),true);
  let s=await state(db);assert.equal(s.status,'queued');assert.equal(s.processed_version,n);assert.equal(s.requested_version,n+2);
  await due(db);const second=await claim(db);assert.notEqual(second.lock_token,first.lock_token);assert.equal(second.claimed_version,n+2);
  assert.equal(await finish(db,first.lock_token,'error'),false);assert.equal((await state(db)).lock_token,second.lock_token);
  await db.query("insert into forecast_runs(id,status) values($1,'running')",[second.lock_token]);
  await finish(db,second.lock_token,'completed',{model_version:'v2'});
  s=await state(db);assert.equal(s.status,'ready');assert.equal(s.processed_version,s.requested_version);assert.equal(await claim(db),undefined);
 }finally{await db.close();}
});

test('errors preserve pending work for retry and expired workers cannot publish old predictions',async()=>{
 const db=await database();
 try{
  await due(db);const first=await claim(db);await db.query("insert into forecast_runs(id,status) values($1,'running')",[first.lock_token]);
  await db.exec("update forecast_refresh_state set lease_until=now()-interval '1 second'");
  assert.equal(await finish(db,first.lock_token,'completed',{model_version:'stale'}),false);
  const replacement=await claim(db);assert(replacement.lock_token);
  assert.equal((await db.query('select status from forecast_runs where id=$1',[first.lock_token])).rows[0].status,'failed');
  await finish(db,replacement.lock_token,'error');let s=await state(db);
  assert.equal(s.status,'error');assert(s.requested_version>s.processed_version);assert(new Date(s.next_attempt_at)>new Date());assert.equal(await claim(db),undefined);
  await due(db);const retry=await claim(db);assert(retry.lock_token);
  await finish(db,retry.lock_token,'waiting_history');s=await state(db);assert.equal(s.status,'waiting_history');assert.equal(s.processed_version,s.requested_version);assert.equal(await claim(db),undefined);
  await sale(db);await due(db);assert((await claim(db)).lock_token);
 }finally{await db.close();}
});

test('horizon changes, import completion and the next store day trigger automatic work',async()=>{
 const db=await database();
 try{
  await due(db);let job=await claim(db);await finish(db,job.lock_token,'waiting_history');
  const version=(await state(db)).requested_version;
  await db.query('select request_forecast_refresh($1)',[14]);assert.equal((await state(db)).horizon_days,14);
  assert.equal((await db.query("select value from system_settings where key='forecast_horizon_days'")).rows[0].value,14);assert.equal((await state(db)).requested_version,version+1);
  await due(db);job=await claim(db);await finish(db,job.lock_token,'waiting_history');
  await db.exec("update forecast_refresh_state set last_checked_on=current_date-2");assert((await claim(db)).lock_token);
  assert.equal((await db.query("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename='forecast_refresh_state'")).rows[0].n,1);
 }finally{await db.close();}
});

function workerDb(){
 const calls=[];let job={lock_token:'job',horizon_days:30};
 return {calls,setJob(value){job=value;},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_forecast_refresh'?(job?[job]:[]):true};}};
}
test('worker starts training in the server, publishes before release and never starts competing local jobs',async()=>{
 const db=workerDb();let release,starts=0;
 const worker=createForecastAutomation({db,train:async job=>{starts++;await new Promise(r=>release=r);await job.publish({model_version:'fresh'});return {skipped:false};}});
 const pending=worker.tick();await new Promise(r=>setImmediate(r));await worker.tick();assert.equal(starts,1);release();await pending;
 const result=db.calls.find(c=>c.name==='finish_forecast_refresh');assert.equal(result.args.p_outcome,'completed');assert.equal(result.args.p_result.model_version,'fresh');
});
test('insufficient history waits for new data; training errors remain retryable',async()=>{
 const db=workerDb();const logger={error(){}};
 await createForecastAutomation({db,logger,train:async()=>({skipped:true})}).tick();
 assert.equal(db.calls.at(-1).args.p_outcome,'waiting_history');
 await createForecastAutomation({db,logger,train:async()=>{throw new Error('Python unavailable');}}).tick();
 assert.equal(db.calls.at(-1).args.p_outcome,'error');
});
test('worker startup resumes persisted work without a page visit and stop cancels its next poll',async()=>{
 const db=workerDb();db.setJob(null);let scheduled,cleared;
 const worker=createForecastAutomation({db,train:()=>assert.fail('No job'),setTimer:fn=>{scheduled=fn;return 10;},clearTimer:id=>cleared=id});
 worker.start();await new Promise(r=>setImmediate(r));assert.equal(db.calls.length,1);assert.equal(typeof scheduled,'function');
 worker.stop();assert.equal(cleared,10);await scheduled();assert.equal(db.calls.length,1);
});

test('trainer respects data readiness and delegates publication to the database lease',async()=>{
 const observations=Array.from({length:60},(_,i)=>({product_id:'part',occurred_on:`2026-09-${String(i%30+1).padStart(2,'0')}`,quantity:1,source:'actual_sale'}));
 const writes=[],sources=[];let readiness=true,python=0,published;
 const db={from(table){return {select(){return this;},in(_key,values){sources.push(values);return this;},order(){return this;},range:async()=>({data:observations}),insert(value){writes.push({table,value});return Promise.resolve({});},update(value){writes.push({table,value});return this;},eq(){return Promise.resolve({});}};},storage:{from(){return {upload:async()=>({})};}}};
 const train=createForecastTrainer({db,getEnvironment:async()=>({mode:'actual',sources:['actual_sale','imported_training_data']}),checkReadiness:async()=>({ready:readiness}),runPython:async()=>{python++;return {result:{model_version:'xgb',metrics:{mae:1},forecasts:[{product_id:'part',forecast_date:'2026-11-01',predicted_quantity:2}]},modelBuffer:Buffer.from('model')};},markMetrics:x=>x});
 readiness=false;assert.equal((await train()).skipped,true);assert.equal(python,0);assert.equal(writes.length,0);
 readiness=true;const result=await train({runId:'leased-job',publish:async value=>published=value});
 assert.equal(result.runId,'leased-job');assert.equal(result.forecastCount,1);assert.equal(published.model_version,'xgb');assert.equal(writes.filter(w=>w.table==='forecast_runs').length,1);assert.deepEqual(sources[0],['actual_sale','imported_training_data']);
});
