# Preparing the raw PartCast workbooks

For the new explicitly simulated capstone workbook, use the separate [website XGBoost demo and measured comparison](DEMO_WORKBOOK_REVIEW.md). Its results are not actual-store accuracy. Regular forecasting imports reject declared simulated demand before changing store history.

For the "not enough usable observations" message, see [the per-part readiness checks and owner-labelled workbook review](FORECAST_READINESS.md). The website now checks the Python engine's actual eligibility rules instead of rejecting every dataset with fewer than 30 input records.

See [the latest sparse-demand correction and measured comparison](SPARSE_DEMAND_REVIEW.md). New recursive runs count only observed sale events, and full-period metrics also include Croston-SBA and TSB reference errors. The change did not lower WAPE on the reviewed extract.

See [current measured prediction accuracy and defense/deployment readiness](PREDICTION_READINESS.md). The latest review reproduces poor historical performance and adds application-matching, whole-period evaluation; successful training is not evidence of accurate current-store predictions.

For a reproducible development-only parameter comparison, see [model improvement review](MODEL_IMPROVEMENT_REVIEW.md) and `ml/compare_forecast_candidates.py`. The final period cannot choose a candidate, and an empty development holdout cannot produce an accuracy percentage. Only verified corrections should change real record values; original data is not edited to force a higher score.

The raw inventory contains current stock and supplier purchase records. Some purchase rows reference an SI# in Notes. The user confirmed that Quantity on those sales-linked rows is the sold quantity. Rows marked STOCK are purchases. Mixed stock/sale notes remain excluded by default; an explicitly confirmed customer allocation can be recovered with the separate option described below.

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

After confirming that the quantity assigned to a customer is sold, add `--customer-allocation-is-sold` alongside `--linked-quantity-is-sold`. Recovery requires two explicitly written positive whole counts: `10 STOCK 10 CUSTOMER SI#123` on an original quantity-20 row qualifies. A customer-first allocation also qualifies. Both counts must add up to the original row quantity. Missing counts, prices, numeric customer labels, replacements/returns, unit conversions and unclear formats are not used to infer quantities. A price marked `/PC` or `/SET` after the invoice reference is not a quantity conversion. Existing invoice/date, identity, duplicate and conflicting-quantity checks still apply. The original total, explicit sold/stock counts and source rows remain in provenance, with accepted splits listed in `Recovered_Allocations`. Historical identifiers are preserved exactly; the importer still skips IDs absent from current inventory. See [the measured customer-allocation review](CUSTOMER_ALLOCATION_REVIEW.md).

A blank primary identifier can now be recovered from `Sub#` only when that exact SKU already exists in the inventory snapshot and appears explicitly on its unique, valid linked invoice. Longer/slash variants, unknown parts and unrelated invoice descriptions do not qualify. Original primary/Sub# values, the identification method and both source row numbers are retained in quantity provenance. Quantity/date ambiguity and duplicate checks still apply after recovery. See [the verified-sales reconciliation](SALES_RECONCILIATION.md).

`PartCast_Actual_Quantity_Training.xlsx` includes the compatible `Daily_B_Usable` sheet. Actual quantities for accepted lines do **not** establish complete sales coverage. Missing dates or parts cannot establish zero demand. The importer matches existing inventory identifiers, skips historical-only parts, and replaces the prior imported-training dataset. Review the workbook before importing it.

The historical benchmark compares equally weighted XGBoost with the previous positive-day weighting, recent averages, Croston-SBA and TSB. It also evaluates full 30-day blocks recursively without using their sales as input. It is exploratory: filling internal missing daily rows with zero is an unverified coverage assumption. It does not select a production method or generate current forecasts. A zero forecast is a diagnostic for sparse data, not a reorder recommendation. Enough eligible history is needed for the benchmark to run.

Production training rejects future dates and excludes eligible products with no usable sale in the past 31 days. This conservative freshness policy should later be replaced by a verified recording window: a slow-moving part can have a recent, complete ledger even with no recent sales. Short unobserved gaps are estimated internally and never written back as observations. Imported coverage warnings are included in metrics. Python's `asOfDate` is available for reproducible historical analysis; the HTTP endpoint keeps the actual current date.

New training runs also save `horizon_validation`: up to three historical origins, each refitted before the chosen planning period. No sale inside the period becomes a training label or recursive input. Only parts already meeting the history minimum before that origin are tested. Report how many parts and positive periods were evaluated, and distinguish this from the older exploratory comparisons. MAE/RMSE are unit errors and WAPE is percentage error, not a percentage of correct forecasts. A no-demand holdout has undefined WAPE. These checks retain the unverified internal-zero coverage limitation; they do not certify production accuracy.

Run `.venv/bin/python ml/evaluate_forecast.py --csv /path/to/actual-demand-daily.csv --output /tmp/prediction-audit.json --as-of YYYY-MM-DD` to reproduce the full historical/eligibility report without changing source data or the database.

For reliable replenishment, record every part/quantity on every sale, separate returns and purchases, verify base units, record stockout periods, and measure supplier lead times. Use a fresh independent holdout with rolling 30-day quantity totals before relying on forecasts for purchases. Do not create artificial transactions to meet the minimum history requirement.
