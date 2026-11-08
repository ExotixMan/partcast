export function planningChart(planning) {
  if (!planning?.product) return [];
  const { today, actualSales = [], data = [], product } = planning;
  const balance=product.current_stock==null||product.current_stock===''?NaN:Number(product.current_stock);
  const openingStock=Number.isFinite(balance)&&balance>=0?balance:null;
  const totals = new Map();
  for (const row of actualSales) totals.set(row.occurred_on, (totals.get(row.occurred_on) || 0) + Number(row.quantity));
  const rows = [];
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 29);
  for (let i = 0; i < 30; i++) {
    const day = date.toISOString().slice(0, 10);
    rows.push({ date: day, actual_quantity: totals.get(day) || 0, projected_stock:day===today?openingStock:null });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  let cumulativeDemand=0;
  for (const row of data.filter(row=>row.forecast_date>today).sort((a,b)=>a.forecast_date.localeCompare(b.forecast_date))) {
    const demand=Number(row.predicted_quantity);
    cumulativeDemand+=demand;
    const projectedStock=openingStock==null?null:Math.max(0,Number((openingStock-cumulativeDemand).toFixed(4)));
    rows.push({ date: row.forecast_date, predicted_quantity:demand, projected_stock:projectedStock });
  }
  return rows;
}
