import {t} from '../context/LocaleContext.jsx';

export default function ForecastFailure({failure}){
 const messages={
  FORECAST_TIMEOUT:t('The forecast took too long to finish. Automatic retry is pending.'),
  FORECAST_RESOURCE_LIMIT:t('The host stopped the forecasting process. Automatic retry is pending.'),
  FORECAST_INTERRUPTED:t('The forecasting process was interrupted. Automatic retry is pending.'),
  FORECAST_DATA_INVALID:t('The forecasting engine could not use the supplied sales history.'),
  FORECAST_OUTPUT_INVALID:t('The forecasting engine returned incomplete or invalid estimates.'),
  FORECAST_ENGINE_ERROR:t('The forecasting engine could not finish the calculation.'),
  FORECAST_SETUP_REQUIRED:t('The forecasting engine is not installed correctly.'),
  FORECAST_RUNTIME_TIMEOUT:t('The forecasting engine took too long to start.'),
  FORECAST_MODEL_STORAGE_ERROR:t('The model file could not be saved.'),
  FORECAST_SAVE_ERROR:t('The forecast quantities could not be saved.'),
  FORECAST_PUBLISH_ERROR:t('The forecast update could not be published.'),
  FORECAST_WORKER_ERROR:t('The forecast update could not finish.')
 };
 const code=Object.hasOwn(messages,failure?.code)?failure.code:null;
 const stage=['preparation','training','model_upload','forecast_save','publication'].includes(failure?.stage)?failure.stage.toUpperCase():null;
 const seconds=Number.isInteger(failure?.elapsed_seconds)&&failure.elapsed_seconds>=0&&failure.elapsed_seconds<=3600?`${failure.elapsed_seconds}s`:null;
 return <p className="mt-2 text-sm text-red-700" role="status">
  {code?messages[code]:t('This update could not finish. Automatic retry is pending.')}
  {code&&<span className="mt-1 block text-xs">{t('Reference')}: {[code,stage,seconds].filter(Boolean).join(' · ')}</span>}
 </p>;
}
