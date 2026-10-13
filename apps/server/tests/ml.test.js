import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',PYTHON_BIN:'C:/Users/Admin/Downloads/PartCast_NPG_Deployable/partcast/.venv/Scripts/python.exe',ML_SCRIPT_PATH:'C:/OldComputer/partcast/ml/train_forecast.py'});
const {runForecastPython,resolveForecastRuntime,forecastingStatus,validateForecastResult}=await import('../src/utils/ml.js');
const asOfDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
const observations=[];
for(const part of ['synthetic-brake','synthetic-oil'])for(let i=0;i<120;i++){const date=new Date(asOfDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-119+i);observations.push({product_id:part,occurred_on:date.toISOString().slice(0,10),quantity:i%3===0?i%5+1:0,source:'actual_sale'});}
test('real XGBoost training survives a copied Windows Python path and produces future estimates plus an artifact',async()=>{
 const runtime=await resolveForecastRuntime();assert.notEqual(runtime.python,process.env.PYTHON_BIN);assert.equal((await forecastingStatus()).ready,true);
 const {result,modelBuffer}=await runForecastPython({observations,asOfDate,horizonDays:7});
 assert.equal(result.forecasts.length,14);assert.equal(new Set(result.forecasts.map(f=>f.product_id)).size,2);
 assert(result.forecasts.every(f=>f.forecast_date>asOfDate&&Number.isFinite(f.predicted_quantity)&&f.predicted_quantity>=0));
 assert.equal(result.metrics.evaluation,'chronological one-day-ahead holdout');assert(Number.isFinite(result.metrics.mae));assert(Number.isFinite(result.metrics.baseline_mae));
 assert.equal(result.metrics.horizon_validation.horizon_days,7);assert.equal(result.metrics.horizon_validation.origin_count,3);
 assert.equal(result.metrics.horizon_validation.tested_product_count,2);assert(Number.isFinite(result.metrics.horizon_validation.model.mae));
 assert(JSON.parse(modelBuffer.toString()).learner);assert.equal(result.training_date_max,asOfDate);
});
test('old or insufficient sales data returns an actionable validation error without fabricated estimates',async()=>{
 await assert.rejects(runForecastPython({observations:[observations[0]],asOfDate,horizonDays:7}),e=>e.status===422&&/enough usable history/.test(e.message));
 const old=observations.map(o=>({...o,occurred_on:'2020'+o.occurred_on.slice(4)}));
 await assert.rejects(runForecastPython({observations:old,asOfDate,horizonDays:7}),e=>e.status===422&&/stale sales history/.test(e.message));
});

test('forecast results cannot invent parts, repeat dates, shorten the horizon or claim false counts',()=>{
 const input={asOfDate:'2026-10-14',horizonDays:7,observations:[{product_id:'identified-part'},{product_id:'sparse-identified-part'}]};
 const valid={forecast_product_count:1,forecast_horizon_days:7,forecasts:Array.from({length:7},(_,i)=>({product_id:'identified-part',forecast_date:`2026-10-${15+i}`,predicted_quantity:0.25}))};
 assert.doesNotThrow(()=>validateForecastResult(valid,input)); // Sparse input parts may legitimately be excluded.
 const altered=change=>{const value=structuredClone(valid);change(value);return value;};
 for(const value of [
  altered(r=>r.forecasts[0].product_id='unidentified-part'),
  altered(r=>r.forecasts[0].product_id=null),
  altered(r=>r.forecasts[0].forecast_date='2026-10-14'),
  altered(r=>r.forecasts[0].forecast_date='2026-10-22'),
  altered(r=>r.forecasts[0].forecast_date=r.forecasts[1].forecast_date),
  altered(r=>r.forecasts.pop()),
  altered(r=>r.forecast_product_count=2),
  altered(r=>r.forecast_horizon_days=30),
  altered(r=>r.forecasts[0].predicted_quantity=Infinity),
  altered(r=>r.forecasts[0].predicted_quantity=-1)
 ])assert.throws(()=>validateForecastResult(value,input),e=>e.status===503&&e.safe===true);
});
