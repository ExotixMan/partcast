import {adminDb} from '../supabase.js';
import {getDataEnvironment,markForecastMetrics} from './dataEnvironment.js';
import {checkForecastReadiness,runForecastPython} from '../utils/ml.js';
import {createForecastTrainer} from './forecastTraining.js';
import {createForecastAutomation} from './forecastAutomation.js';

export const trainForecast=createForecastTrainer({db:adminDb,getEnvironment:getDataEnvironment,checkReadiness:checkForecastReadiness,runPython:runForecastPython,markMetrics:markForecastMetrics});
export async function prepareForecastUpgrade(db=adminDb){
 const {data:latest,error}=await db.from('latest_completed_forecast_run').select('model_version').maybeSingle();
 if(error)throw error;
 if(latest?.model_version?.startsWith('xgb-direct-period-'))return;
 const {data:state,error:stateError}=await db.from('forecast_refresh_state').select('status').eq('id',1).single();
 if(stateError)throw stateError;
 if(['queued','training'].includes(state?.status))return;
 const {error:requestError}=await db.rpc('request_forecast_refresh',{p_horizon:null});
 if(requestError)throw requestError;
}
export const automaticForecasts=createForecastAutomation({db:adminDb,train:trainForecast,prepare:prepareForecastUpgrade});
