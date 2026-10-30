import {adminDb} from '../supabase.js';
import {getDataEnvironment,markForecastMetrics} from './dataEnvironment.js';
import {checkForecastReadiness,runForecastPython} from '../utils/ml.js';
import {createForecastTrainer} from './forecastTraining.js';
import {createForecastAutomation} from './forecastAutomation.js';

export const trainForecast=createForecastTrainer({db:adminDb,getEnvironment:getDataEnvironment,checkReadiness:checkForecastReadiness,runPython:runForecastPython,markMetrics:markForecastMetrics});
export const automaticForecasts=createForecastAutomation({db:adminDb,train:trainForecast});
