import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret'});
const {prepareForecastUpgrade}=await import('../src/services/automaticForecasts.js');

test('deployment queues one new-strategy run only when an older model is idle',async()=>{
 for(const [version,status,expected] of [['xgb-observed-events-old','ready',1],['xgb-direct-period-new','ready',0],['xgb-observed-events-old','training',0],['xgb-observed-events-old','queued',0],[null,'waiting_history',1]]){
  let requests=0;
  const db={from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:version?{model_version:version}:null}),single:async()=>({data:{status}})};},rpc:async(name,args)=>{assert.equal(name,'request_forecast_refresh');assert.deepEqual(args,{p_horizon:null});requests++;return {};}};
  await prepareForecastUpgrade(db);assert.equal(requests,expected);
 }
});
