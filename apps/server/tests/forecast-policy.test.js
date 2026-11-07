import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePlanningHorizon} from '../src/utils/forecastPolicy.js';
import {createForecastTrainer} from '../src/services/forecastTraining.js';
import {createForecastAutomation} from '../src/services/forecastAutomation.js';

test('new forecasts accept up to 60 days and reject 90, fractions and malformed input',()=>{
 for(const value of [7,14,30,45,60])assert.equal(validatePlanningHorizon(value),value);
 for(const value of [6,61,90,NaN,Infinity,14.5,true,'30',null])assert.throws(()=>validatePlanningHorizon(value),e=>e.status===422&&e.code==='FORECAST_HORIZON_INVALID');
});

test('invalid forecast horizons cannot read data, create runs or enqueue jobs',async()=>{
 let touched=false;
 const trainer=createForecastTrainer({getEnvironment:async()=>{touched=true;return {};}});
 await assert.rejects(trainer({horizonDays:90}),e=>e.code==='FORECAST_HORIZON_INVALID');
 const worker=createForecastAutomation({db:{rpc:async()=>{touched=true;return {};}}});
 await assert.rejects(worker.request(90),e=>e.code==='FORECAST_HORIZON_INVALID');
 assert.equal(touched,false);
});

Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});

test('startup replaces a saved 90-day setting with 60 even when a job is already pending',async()=>{
 const {prepareForecastUpgrade}=await import('../src/services/automaticForecasts.js');
 for(const status of ['ready','queued','training','error']){
  const calls=[];
  const db={from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{model_version:'xgb-pattern-period-current'}}),single:async()=>({data:{status,horizon_days:90}})};},rpc:async(name,args)=>{calls.push([name,args]);return {};}};
  await prepareForecastUpgrade(db);
  assert.deepEqual(calls,[['request_forecast_refresh',{p_horizon:60}]]);
 }
});

test('the runtime adapter refuses a 90-day job before starting Python',async()=>{
 const {runForecastPython}=await import('../src/utils/ml.js');
 await assert.rejects(runForecastPython({observations:[],horizonDays:90}),e=>e.code==='FORECAST_HORIZON_INVALID');
});

test('an older model already training receives one follow-up upgrade through the durable queue',async()=>{
 const {prepareForecastUpgrade}=await import('../src/services/automaticForecasts.js');
 const calls=[];
 const db={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{model_version:'legacy-recursive-model'}}),single:async()=>({data:{status:'training',horizon_days:30}})};},rpc:async(name,args)=>{calls.push([name,args]);return {};}};
 await prepareForecastUpgrade(db);
 assert.deepEqual(calls,[['request_forecast_refresh',{p_horizon:null}]]);
});

test('HTTP training, automatic refresh and settings refuse 90 days before any write',async()=>{
 const {adminDb}=await import('../src/supabase.js');
 const {authenticate}=await import('../src/middleware/auth.js');
 const {default:api}=await import('../src/routes/api.js');
 const {default:admin}=await import('../src/routes/admin.js');
 const {errorHandler}=await import('../src/middleware/error.js');
 const {default:express}=await import('express');
 const original={from:adminDb.from,auth:adminDb.auth.getUser,rpc:adminDb.rpc};
 const id='11111111-1111-4111-8111-111111111111',session='77777777-7777-4777-8777-777777777777';
 const token=`e30.${Buffer.from(JSON.stringify({session_id:session,amr:[{method:'password'}]})).toString('base64url')}.fixture`;
 let writes=0;
 adminDb.auth.getUser=async()=>({data:{user:{id,email:'fixture@example.test'}}});
 adminDb.from=table=>{
  assert(['profiles','login_verifications'].includes(table));
  return {select(){return this;},eq(){return this;},single:async()=>({data:{id,active:true,role:'super_admin'}}),maybeSingle:async()=>({data:{expires_at:'2099-01-01T00:00:00Z'}})};
 };
 adminDb.rpc=async()=>{writes++;return {};};
 const app=express();app.use(express.json());app.use('/api/admin',authenticate,admin);app.use('/api',authenticate,api);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`,headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 try{
  for(const [path,method,body] of [['/api/forecast/train','POST',{horizonDays:90}],['/api/forecast/automation','POST',{horizonDays:90}],['/api/admin/settings/forecast_horizon_days','PATCH',{value:90}]]){
   const response=await fetch(base+path,{method,headers,body:JSON.stringify(body)});
   assert.equal(response.status,400);assert.match((await response.json()).error,/60/);assert.equal(writes,0);
  }
 }finally{adminDb.from=original.from;adminDb.auth.getUser=original.auth;adminDb.rpc=original.rpc;await new Promise(r=>server.close(r));}
});
