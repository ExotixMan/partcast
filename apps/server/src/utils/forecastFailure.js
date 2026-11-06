const messages={
 FORECAST_TIMEOUT:'The forecast took too long to finish. Automatic retry is pending.',
 FORECAST_RESOURCE_LIMIT:'The host stopped the forecasting process. Automatic retry is pending.',
 FORECAST_INTERRUPTED:'The forecasting process was interrupted. Automatic retry is pending.',
 FORECAST_DATA_INVALID:'The forecasting engine could not use the supplied sales history.',
 FORECAST_OUTPUT_INVALID:'The forecasting engine returned incomplete or invalid estimates.',
 FORECAST_ENGINE_ERROR:'The forecasting engine could not finish the calculation.',
 FORECAST_SETUP_REQUIRED:'The forecasting engine is not installed correctly.',
 FORECAST_RUNTIME_TIMEOUT:'The forecasting engine took too long to start.',
 FORECAST_MODEL_STORAGE_ERROR:'The model file could not be saved.',
 FORECAST_SAVE_ERROR:'The forecast quantities could not be saved.',
 FORECAST_PUBLISH_ERROR:'The forecast update could not be published.',
 FORECAST_WORKER_ERROR:'The forecast update could not finish.'
};
const stages=new Set(['preparation','training','model_upload','forecast_save','publication']);
const stageCodes={model_upload:'FORECAST_MODEL_STORAGE_ERROR',forecast_save:'FORECAST_SAVE_ERROR',publication:'FORECAST_PUBLISH_ERROR'};
const dbCodes=new Set(['23502','23503','23505','23514','42501','42P01','42703','PGRST116','PGRST205']);
const signals=new Set(['SIGKILL','SIGTERM','SIGABRT','SIGSEGV']);

export function forecastFailure(error,stage='preparation',elapsedMs){
 const previous=error?.forecastFailure;
 stage=stages.has(previous?.stage)?previous.stage:stages.has(stage)?stage:'preparation';
 const candidate=previous?.code||error?.code;
 const code=Object.hasOwn(messages,candidate)?candidate:error?.signal==='SIGKILL'?'FORECAST_RESOURCE_LIMIT':stageCodes[stage]||'FORECAST_WORKER_ERROR';
 const result={code,stage};
 const elapsed=previous?.elapsed_seconds??(Number.isFinite(elapsedMs)?Math.round(elapsedMs/1000):null);
 if(Number.isInteger(elapsed)&&elapsed>=0&&elapsed<=3600)result.elapsed_seconds=elapsed;
 const signal=previous?.signal||error?.signal;
 if(signals.has(signal))result.signal=signal;
 const exit=previous?.exit_code??error?.exitCode;
 if(Number.isInteger(exit)&&exit>=0&&exit<=255)result.exit_code=exit;
 const dbCode=previous?.database_code||error?.code;
 if(dbCodes.has(dbCode))result.database_code=dbCode;
 const status=Number(previous?.provider_status??error?.statusCode??error?.status);
 if(Number.isInteger(status)&&status>=400&&status<=599)result.provider_status=status;
 return result;
}

export const forecastFailureMessage=failure=>Object.hasOwn(messages,failure?.code)?messages[failure.code]:messages.FORECAST_WORKER_ERROR;
