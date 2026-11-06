const simulated = /(?:simulat(?:ed|ion)|synthetic|owner[_ -]informed[_ -]model)/i;

export function forecastData(rows, mode = 'actual') {
  const observations = [], seen = new Map();
  let excludedGenerated = 0, duplicates = 0;
  for (const row of rows) {
    const reference = String(row.source_reference || '').trim();
    const generatedReference = reference === `training:${row.product_id}:${row.occurred_on}`;
    if (mode !== 'simulated_demo' && (row.source === 'simulated_demo' || simulated.test(reference) || generatedReference)) {
      excludedGenerated++;
      continue;
    }
    if (reference) {
      const key = JSON.stringify([row.product_id, row.occurred_on, row.source, reference]);
      if (seen.has(key)) {
        if (Number(seen.get(key)) !== Number(row.quantity)) throw Object.assign(new Error('Conflicting quantities share the same sales reference. Review the imported records before forecasting.'), {status:422, safe:true});
        duplicates++;
        continue;
      }
      seen.set(key, row.quantity);
    }
    observations.push(row);
  }
  return {observations, quality:{input_rows:rows.length, included_rows:observations.length, excluded_generated_rows:excludedGenerated, duplicate_reference_rows:duplicates}};
}
