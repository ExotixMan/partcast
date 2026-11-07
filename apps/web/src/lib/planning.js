export function planningChart(planning) {
  if (!planning?.product) return [];
  const { today, actualSales = [], data = [] } = planning;
  const totals = new Map();
  for (const row of actualSales) totals.set(row.occurred_on, (totals.get(row.occurred_on) || 0) + Number(row.quantity));
  const rows = [];
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 29);
  for (let i = 0; i < 30; i++) {
    const day = date.toISOString().slice(0, 10);
    rows.push({ date: day, actual_quantity: totals.get(day) || 0 });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  for (const row of data) {
    rows.push({ date: row.forecast_date, predicted_quantity: Number(row.predicted_quantity) });
  }
  return rows;
}
