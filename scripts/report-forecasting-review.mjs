#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from '../apps/server/node_modules/exceljs/excel.js';

const directory = path.resolve(process.argv[2] || '/tmp/partcast-data-review');
const quality = JSON.parse(await readFile(path.join(directory, 'quality-summary.json'), 'utf8'));
const comparison = JSON.parse(await readFile(path.join(directory, 'forecast-method-comparison.json'), 'utf8'));
const tables = JSON.parse(await readFile(path.join(directory, 'tables.json'), 'utf8'));
const eligibilityTable = tables['PartCast_Actual_Quantity_Training.xlsx'].Product_Eligibility;
const eligible = eligibilityTable.slice(1).map(row => Object.fromEntries(eligibilityTable[0].map((key, i) => [key, row[i]]))).filter(row => row['Meets Existing Model Minimum']);
const blockTable = Object.entries(comparison.blocked_30_day_methods).map(([method, metrics]) => `| ${method} | ${metrics.mae} | ${metrics.wape_percent ?? 'Undefined'} | ${metrics.predicted_units} |`).join('\n');
const percent = (quality.invoices_with_accepted_quantities / quality.invoice_rows * 100).toFixed(1);
const report = `# PartCast raw-data and forecasting review

Reviewed as of ${quality.as_of}. Original uploads are unchanged. The source hashes are in quality-summary.json.

The most useful improvement is complete, recent sales lines for each part. The new files recover actual quantities and expose missing history; they do not establish reliable forecasts for the current inventory.

## What was recovered

- ${quality.invoice_rows.toLocaleString()} unique invoices were found.
- ${quality.accepted_quantity_lines} accepted quantity lines became ${quality.accepted_daily_part_rows} date-and-part observations for ${quality.products_with_actual_quantities} parts.
- ${quality.invoices_with_accepted_quantities} invoices (${percent}%) have at least one accepted quantity line. This does not mean all their items were recovered.
- ${quality.inventory_snapshot_rows} numeric inventory rows and ${quality.purchase_or_sales_linked_rows} purchase/sales-linked rows were preserved in the cleaned inventory workbook.
- Quantity on an inventory row referencing SI# was used as sold quantity, as you confirmed. Sale dates come from the linked invoice; purchase dates remain separate.
- Explicit piece quantities were accepted only when their text identifies one exact inventory part. Invoice amounts, unit costs, liters, package sizes and transaction counts were not converted into sold quantities.
- STOCK rows, mixed stock/sale allocations, missing identifiers, duplicate sale lines and uncertain dates require review. No values were invented or silently forward-filled.
- Customer names were omitted from forecasting files. The cleaned inventory retains supplier notes for your private review.

## Why forecasting is still limited

Only ${quality.products_meeting_existing_minimum} parts meet the existing minimum of five sale days and 35 days of history:

| Part | Recorded sale days | First sale | Latest sale |
| --- | ---: | --- | --- |
${eligible.map(row => `| ${row['Part Number']} | ${row['Observed Days']} | ${row['First Sale']} | ${row['Last Sale']} |`).join('\n')}

${quality.products_with_five_recent_sale_days} parts have five recorded sale days in the last 365 days. The latest accepted sale date anywhere in the extract is ${quality.latest_accepted_sale}, as parsed. Parts may have many other sales that are absent from the linked quantity extract. An absent row cannot prove zero demand.

The invoice date review found ${quality.invoice_date_status.missing_date || 0} missing dates, ${quality.invoice_date_status.future_date || 0} future dates, ${quality.invoice_date_status.invalid_date || 0} invalid dates and ${quality.invoice_date_status.possible_day_month_swap || 0} potential day/month swaps. Proposed swaps are flagged, not applied. Resolve them against receipts before reprocessing.

## Historical method comparison

These are exploratory comparisons of recorded quantities. Missing daily rows were assumed zero for this experiment, an unverified assumption. There are only ${comparison.test_days_with_recorded_demand} positive test days between ${comparison.historical_evaluation_start} and ${comparison.historical_evaluation_end}.

The 30-day comparison forecasts a full block before seeing any sales in that block. It contains ${comparison.blocked_30_day_count} complete part/block windows, only ${comparison.blocked_30_day_nonzero_count} with positive recorded quantities. Their total recorded quantity is ${Object.values(comparison.blocked_30_day_methods)[0]?.actual_recorded_units ?? 0}.

| Method | Mean absolute error per 30-day block | WAPE % | Total predicted units |
| --- | ---: | ---: | ---: |
${blockTable}

XGBoost predicts almost zero and misses almost all recorded units. Its low daily average error is driven by many assumed-zero days. The zero forecast is a diagnostic, not a restocking recommendation. Croston-SBA and TSB also lack enough history to establish a dependable improvement. Do not choose or deploy a model from this comparison; obtain a recent independent evaluation period first.

## Changes to the application

- Removed the fourfold weighting of positive sale days, which distorted expected quantities. Holdout evaluation and the final fit now use equal weights.
- Current forecasts exclude eligible products whose latest sale record is more than 31 days old. This conservative check is a safeguard, not a claim that a part stopped selling.
- Short gaps are estimated internally instead of being inserted as actual zero sales. The source observations are unchanged.
- Future-dated history is rejected; expected data-quality errors are shown as readable messages.
- Forecast results disclose imported-history coverage concerns and compare with recent-average and zero diagnostic errors.

## Best next steps

1. Resolve Review_Issues and Quantity_Provenance in the training workbook against original receipts. Mixed STOCK/SI# rows need the quantity allocated specifically to the sale, not the whole purchase quantity.
2. Record every sale as one line per part: date, invoice reference, exact part number, quantity sold and base unit. Keep returns, purchases, stock adjustments and canceled invoices separate. The blank capture template contains no invented examples.
3. Use a single date format, YYYY-MM-DD. Keep leading zeros in part numbers. Review brand, pack/set and slash-variant distinctions before merging parts.
4. Capture stock availability and stockout periods. No sales while unavailable does not mean no customer demand. Track supplier order and received dates so reorder timing can use measured lead times.
5. Build 6–12 months of complete recent records. Validate rolling 30-day totals on dates held back from training. Compare XGBoost, recent averages, Croston-SBA and TSB; report bias and total quantities alongside MAE/WAPE. Sparse parts may need a simple policy until sufficient history exists.

## Files and use

- [Actual quantity training workbook](PartCast_Actual_Quantity_Training.xlsx): daily rows, original-row provenance, eligibility, monthly coverage and review issues.
- [Cleaned inventory](Inventory_Cleaned.xlsx): current stock and purchase history kept separate.
- [Cleaned sales](Sales_Cleaned.xlsx): invoice ledger and accepted quantity lines.
- [Sales capture template](Sales_Capture_Template.xlsx): blank entry sheets with plain instructions.
- [Method comparison](Forecast_Method_Comparison.xlsx): historical metrics and their limitations.
- quality-summary.json and forecast-method-comparison.json contain machine-readable results.

Daily_B_Usable matches the existing training importer. That importer matches current inventory part numbers and replaces the previous imported-training set; historical-only parts are skipped. Review before importing. Current forecasting intentionally refuses this stale eligible history. No Supabase database changes were made.
`;
await writeFile(path.join(directory, 'Forecasting_Review.md'), report);

async function workbook(filename, sheets) {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    rows.forEach(row => sheet.addRow(row));
    sheet.columns.forEach((col, i) => { col.width = Math.min(70, Math.max(20, String(rows[0][i] || '').length + 3)); });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length, column: rows[0].length } };
  }
  await book.xlsx.writeFile(path.join(directory, filename));
}
const fields = ['Method', 'MAE', 'RMSE', 'WAPE Percent', 'Bias', 'Recorded Units', 'Predicted Units'];
await workbook('Forecast_Method_Comparison.xlsx', {
  READ_FIRST: [['Topic', 'Details'], ...comparison.limitations.map(item => ['Limitation', item]), ['Current forecasting', 'Not production ready. Sparse historical records, partial quantity coverage.'], ['Evaluation dates', `${comparison.historical_evaluation_start} to ${comparison.historical_evaluation_end}`]],
  Thirty_Day_Blocks: [fields, ...Object.entries(comparison.blocked_30_day_methods).map(([key, value]) => [key, value.mae, value.rmse, value.wape_percent, value.bias, value.actual_recorded_units, value.predicted_units])],
  Daily_Next_Day: [fields, ...Object.entries(comparison.daily_one_step_methods).map(([key, value]) => [key, value.mae, value.rmse, value.wape_percent, value.bias, value.actual_recorded_units ?? null, value.predicted_units ?? null])]
});
await workbook('Sales_Capture_Template.xlsx', {
  READ_FIRST: [['Field or task', 'What to enter'], ['One row', 'One part on one invoice. Enter all parts, even if the invoice has several items.'], ['Date', 'Sale date as YYYY-MM-DD, for example the date on the receipt.'], ['Part Number', 'Exact identifier from inventory; keep leading zeros.'], ['Demand Quantity', 'Actual quantity sold, greater than zero. Do not enter total invoice money or purchased stock.'], ['Unit', 'pcs, set, box, bottle, etc. Convert only using a verified conversion for this part.'], ['Sale Reference', 'Unique invoice reference; needed to find duplicates.'], ['Returns and purchases', 'Keep separate. Do not enter negative rows in Daily_B_Usable.'], ['Closed_Day_Check', 'Confirm all sales were recorded that day; record whether the business was open and whether items were out of stock.'], ['Training import', 'The app matches Date, Part Number and Demand Quantity. Review the complete ledger before uploading.']],
  Daily_B_Usable: [['Date', 'Part Number', 'Demand Quantity', 'Unit', 'Sale Reference', 'Line Number', 'Notes']],
  Closed_Day_Check: [['Date', 'Business Open', 'All Sales Recorded', 'Parts Out Of Stock', 'Notes']],
  Supplier_Lead_Time: [['Supplier', 'Part Number', 'Order Date', 'Received Date', 'Quantity Received', 'Purchase Reference']]
});
console.log('Saved review report, comparison workbook and blank capture template.');
