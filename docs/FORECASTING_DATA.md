# Preparing the raw PartCast workbooks

The raw inventory contains current stock and supplier purchase records. Some purchase rows reference an SI# in Notes. The user confirmed that Quantity on those sales-linked rows is the sold quantity. Rows marked STOCK are purchases, and mixed stock/sale allocations need review.

Run from the repository after installing the server and Python dependencies:

```bash
node scripts/prepare-forecasting-data.mjs \
  --sales /path/to/CUST-REF-TRANS.xlsx \
  --inventory /path/to/Inventory-npg.xlsx \
  --out /tmp/partcast-data-review \
  --as-of 2026-10-08 \
  --linked-quantity-is-sold

.venv/bin/python ml/benchmark_raw_forecast.py \
  --csv /tmp/partcast-data-review/actual-demand-daily.csv \
  --output /tmp/partcast-data-review/forecast-method-comparison.json

node scripts/report-forecasting-review.mjs /tmp/partcast-data-review
.venv/bin/python -m unittest discover -s ml -p 'test_*.py'
```

Use the actual review date for `--as-of`. Do not pass `--linked-quantity-is-sold` for a different workbook unless its quantity semantics are confirmed. Inputs are read through the application's bounded Excel parser; formulas are not evaluated. The originals remain unchanged. Outputs include private source data and supplier notes, so keep the output directory outside Git and restrict access.

The preparation joins a unique SI# to its invoice date, preserves exact part identifiers and original row locations, excludes STOCK quantities, and quarantines missing, ambiguous, future or suspicious dates, missing identifiers, conflicting quantities and possible duplicate lines. Invoice money is never divided by a price to estimate units. Product labels such as “RADIATOR” need an exact identifier. Explicit piece quantities require one exact inventory part match. Pack sizes and liquid volumes are not silently interpreted as sold units.

`PartCast_Actual_Quantity_Training.xlsx` includes the compatible `Daily_B_Usable` sheet. Actual quantities for accepted lines do **not** establish complete sales coverage. Missing dates or parts cannot establish zero demand. The importer matches existing inventory identifiers, skips historical-only parts, and replaces the prior imported-training dataset. Review the workbook before importing it.

The historical benchmark compares equally weighted XGBoost with the previous positive-day weighting, recent averages, Croston-SBA and TSB. It also evaluates full 30-day blocks recursively without using their sales as input. It is exploratory: filling internal missing daily rows with zero is an unverified coverage assumption. It does not select a production method or generate current forecasts. A zero forecast is a diagnostic for sparse data, not a reorder recommendation. Enough eligible history is needed for the benchmark to run.

Production training rejects future dates and excludes eligible products with no usable sale in the past 31 days. This conservative freshness policy should later be replaced by a verified recording window: a slow-moving part can have a recent, complete ledger even with no recent sales. Short unobserved gaps are estimated internally and never written back as observations. Imported coverage warnings are included in metrics. Python's `asOfDate` is available for reproducible historical analysis; the HTTP endpoint keeps the actual current date.

For reliable replenishment, record every part/quantity on every sale, separate returns and purchases, verify base units, record stockout periods, and measure supplier lead times. Use a fresh independent holdout with rolling 30-day quantity totals before relying on forecasts for purchases. Do not create artificial transactions to meet the minimum history requirement.
