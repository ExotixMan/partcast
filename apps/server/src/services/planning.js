import { fetchAll } from '../utils/helpers.js';

export async function getProductPlanning(db, productId, today = new Date().toISOString().slice(0, 10)) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const [product, latest, observations] = await Promise.all([
    db.from('products').select('id,part_number,description,brand,current_stock,minimum_stock,safety_stock').eq('id', productId).eq('active', true).single(),
    db.from('latest_completed_forecast_run').select('id,horizon_days,completed_at').maybeSingle(),
    fetchAll(() => db.from('demand_observations').select('occurred_on,quantity').eq('product_id', productId).eq('source', 'actual_sale').gte('occurred_on', start.toISOString().slice(0, 10)).lte('occurred_on', today).order('occurred_on').order('id'))
  ]);
  if (product.error) throw product.error;
  if (latest.error) throw latest.error;
  // Never combine overlapping predictions from older completed model runs.
  let data = [];
  if (latest.data) {
    const result = await db.from('demand_forecasts').select('forecast_date,predicted_quantity,run_id')
      .eq('product_id', productId).eq('run_id', latest.data.id).gt('forecast_date', today).order('forecast_date').limit(90);
    if (result.error) throw result.error;
    data = result.data || [];
  }
  return { data, product: product.data, actualSales: observations, run: latest.data, today };
}
