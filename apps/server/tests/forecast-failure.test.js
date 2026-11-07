import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecastFailure,forecastFailureMessage} from '../src/utils/forecastFailure.js';
import {createForecastTrainer} from '../src/services/forecastTraining.js';
import {createForecastAutomation} from '../src/services/forecastAutomation.js';

test('forecast diagnostics expose bounded failure references without provider messages or secrets',()=>{
 const secret='fixture-secret-never-publish';
 const error={code:'FORECAST_TIMEOUT',message:secret,details:secret,stack:secret,headers:{authorization:secret}};
 assert.deepEqual(forecastFailure(error,'training',120000),{code:'FORECAST_TIMEOUT',stage:'training',elapsed_seconds:120});
 assert.match(forecastFailureMessage(forecastFailure(error)),/too long/);
 const database=forecastFailure({code:'23505',message:secret,statusCode:'409'},'forecast_save');
 assert.deepEqual(database,{code:'FORECAST_SAVE_ERROR',stage:'forecast_save',database_code:'23505',provider_status:409});
 const unknown=forecastFailure({code:secret,signal:secret,status:secret,forecastFailure:{stage:secret,code:secret,signal:secret,elapsed_seconds:secret}},secret);
 assert.deepEqual(unknown,{code:'FORECAST_WORKER_ERROR',stage:'preparation'});
 for(const value of [database,unknown,forecastFailureMessage(unknown)])assert(!JSON.stringify(value).includes(secret));
 assert.equal(forecastFailure({signal:'SIGKILL'},'training').code,'FORECAST_RESOURCE_LIMIT');
});

test('training, model storage, quantity storage and publication failures are saved with their own safe stages',async()=>{
 for(const [phase,expected] of [['training','FORECAST_TIMEOUT'],['model_upload','FORECAST_MODEL_STORAGE_ERROR'],['forecast_save','FORECAST_SAVE_ERROR'],['publication','FORECAST_PUBLISH_ERROR']]){
  const writes=[],filters=[];
  const original=Object.assign(new Error('fixture-secret-never-publish'),{code:phase==='training'?'FORECAST_TIMEOUT':phase==='forecast_save'?'23503':'private-upstream-code'});
  if(phase==='model_upload')Object.freeze(original);
  const db={from(table){
   const query={select(){return this;},in(){return this;},order(){return this;},range:async()=>({data:[{product_id:'part',occurred_on:'2026-11-07',quantity:1,source:'actual_sale'}]}),
    async insert(value){if(table==='demand_forecasts'&&phase==='forecast_save')return {error:original};return {};},
    update(value){writes.push({table,value});return this;},eq(column,value){filters.push([column,value]);return this;},then(resolve){resolve({});}};
   return query;
  },storage:{from(){return {upload:async()=>phase==='model_upload'?{error:original}:{}};}}};
  const trainer=createForecastTrainer({db,day:()=> '2026-11-07',getEnvironment:async()=>({mode:'actual',sources:['actual_sale']}),checkReadiness:async()=>({ready:true}),markMetrics:x=>x,
   runPython:async()=>{if(phase==='training')throw original;return {result:{model_version:'fixture-model',metrics:{},forecasts:[{product_id:'part',forecast_date:'2026-11-08',predicted_quantity:1}]},modelBuffer:Buffer.from('fixture')};}});
  await assert.rejects(trainer({runId:'fixture-run',publish:async()=>{if(phase==='publication')throw original;}}),error=>error===original);
  const failure=writes.find(w=>w.table==='forecast_runs').value;
  assert.equal(failure.status,'failed');assert.equal(failure.metrics.failure.code,expected);assert.equal(failure.metrics.failure.stage,phase);
  assert(!JSON.stringify(failure).includes('fixture-secret-never-publish'));
  assert(filters.some(([key,value])=>key==='status'&&value==='running'));
 }
});

test('the background worker logs the saved diagnosis and keeps the failed work pending',async()=>{
 const logs=[],calls=[];
 const failure={code:'FORECAST_MODEL_STORAGE_ERROR',stage:'model_upload',provider_status:413,elapsed_seconds:7};
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_forecast_refresh'?[{lock_token:'fixture-run',horizon_days:90}]:true};}};
 const worker=createForecastAutomation({db,logger:{error:(...args)=>logs.push(args)},train:async()=>{throw {message:'fixture-secret',forecastFailure:failure};}});
 await worker.tick();
 assert.equal(calls.at(-1).args.p_outcome,'error');
 assert.deepEqual(logs[0],['Automatic forecasting is waiting to retry.',failure]);
 assert(!JSON.stringify(logs).includes('fixture-secret'));
});
