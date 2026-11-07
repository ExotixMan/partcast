import {MAX_PLANNING_DAYS} from '../utils/forecastPolicy.js';
import { fetchAll } from '../utils/helpers.js';
import {forecastData} from '../utils/forecastData.js';
import {partReliability,reliabilityForPart,forecastReliabilityPolicy} from '../utils/forecastReliability.js';

export async function getProductPlanning(db, productId, today = new Date().toISOString().slice(0, 10), environment = {mode:'actual',sources:['actual_sale','imported_training_data']}) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const [product, latest, observations] = await Promise.all([
    db.from('products').select('id,part_number,description,brand,current_stock,minimum_stock,safety_stock').eq('id', productId).eq('active', true).single(),
    db.from('latest_completed_forecast_run').select('id,horizon_days,completed_at,metrics').maybeSingle(),
    fetchAll(() => db.from('demand_observations').select('product_id,occurred_on,quantity,source,source_reference').eq('product_id', productId).in('source', environment.sources).gte('occurred_on', start.toISOString().slice(0, 10)).lte('occurred_on', today).order('occurred_on').order('id'))
  ]);
  if (product.error) throw product.error;
  if (latest.error) throw latest.error;
  const run=Number(latest.data?.horizon_days)>MAX_PLANNING_DAYS?null:latest.data;
  let data = [];
  if (run) {
    const result = await db.from('demand_forecasts').select('forecast_date,predicted_quantity,run_id')
      .eq('product_id', productId).eq('run_id', run.id).gt('forecast_date', today).order('forecast_date').limit(MAX_PLANNING_DAYS);
    if (result.error) throw result.error;
    data = result.data || [];
  }
  const reliability=reliabilityForPart(partReliability(run?.metrics,run?.horizon_days),productId);
  return { data, product: product.data, actualSales: forecastData(observations,environment.mode).observations, run, today, reliability, reliability_policy:forecastReliabilityPolicy };
}
