import crypto from 'node:crypto';
import {fetchAll} from '../utils/helpers.js';
import {forecastData} from '../utils/forecastData.js';
import {forecastFailure,forecastFailureMessage} from '../utils/forecastFailure.js';
import {validatePlanningHorizon} from '../utils/forecastPolicy.js';

export const storeDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());

export function createForecastTrainer({db,getEnvironment,checkReadiness,runPython,markMetrics,day=storeDay}){
 return async function train({horizonDays=30,includeProxy=false,actorId=null,runId=crypto.randomUUID(),publish}={}){
  validatePlanningHorizon(horizonDays);
  if(includeProxy)throw Object.assign(new Error('Forecasting requires actual sold quantities. Use the separate demo for simulated demand.'),{status:422});
  const environment=await getEnvironment();
  const input=await fetchAll(()=>db.from('demand_observations').select('product_id,occurred_on,quantity,source,source_reference').in('source',environment.sources).order('occurred_on').order('id'));
  const {observations,quality}=forecastData(input,environment.mode);
  if(!observations.length)return {skipped:true,reason:'Not enough demand observations.'};
  const asOfDate=day();
  const readiness=await checkReadiness({observations,asOfDate,horizonDays});
  if(!readiness.ready)return {skipped:true,reason:readiness.message,readiness};
  const run={id:runId,status:'running',horizon_days:horizonDays,include_proxy:false,training_rows:observations.length,product_count:new Set(observations.map(o=>o.product_id)).size,started_by:actorId};
  const {error:runError}=await db.from('forecast_runs').insert(run);
  if(runError)throw runError;
  let stage='training';
  const started=Date.now();
  try{
   const {result,modelBuffer}=await runPython({observations,horizonDays,asOfDate});
   const modelPath=`models/${runId}.json`;
   stage='model_upload';
   const {error:uploadError}=await db.storage.from('partcast-models').upload(modelPath,modelBuffer,{contentType:'application/json',upsert:true});
   if(uploadError)throw uploadError;
   stage='forecast_save';
   const rows=result.forecasts.map(f=>({run_id:runId,product_id:f.product_id,forecast_date:f.forecast_date,predicted_quantity:f.predicted_quantity}));
   for(let i=0;i<rows.length;i+=500){const {error}=await db.from('demand_forecasts').insert(rows.slice(i,i+500));if(error)throw error;}
   const completion={model_version:result.model_version,metrics:markMetrics({...result.metrics,data_quality:quality},environment),training_date_min:result.training_date_min,training_date_max:result.training_date_max,model_storage_path:modelPath};
   stage='publication';
   if(publish)await publish(completion);
   else{
    const {error}=await db.from('forecast_runs').update({...completion,status:'completed',completed_at:new Date().toISOString()}).eq('id',runId);
    if(error)throw error;
   }
   return {skipped:false,runId,metrics:completion.metrics,forecastCount:rows.length};
  }catch(error){
   const failure=forecastFailure(error,stage,Date.now()-started);
   try{if(error&&typeof error==='object')error.forecastFailure=failure;}catch{}
   try{await db.from('forecast_runs').update({status:'failed',error_message:forecastFailureMessage(failure),metrics:{failure},completed_at:new Date().toISOString()}).eq('id',runId).eq('status','running');}catch{/* Preserve the original error; the durable job remains pending. */}
   throw error;
  }
 };
}
