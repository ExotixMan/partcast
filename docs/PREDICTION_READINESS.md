# Prediction accuracy and defense readiness — 12 October 2026

Latest follow-up: [the 14 October sparse-demand correction](SPARSE_DEMAND_REVIEW.md) separates expected quantities from observed sale events. On the identical 30-day periods, WAPE is now 100.3285%, compared with the earlier 100.0345% below. This does not establish improved accuracy or change the readiness conclusion. Earlier figures remain historical snapshots.

Follow-up on 14 October: [three candidate model profiles were compared using development data](MODEL_IMPROVEMENT_REVIEW.md). There were no positive development periods, so no replacement or high-accuracy claim was selected. Actual records and identified parts remain unchanged; input and output integrity checks were strengthened. The results below remain the earlier measured historical diagnostics.

**The forecasting software runs, but accurate current-store forecasting has not been established. The uploaded quantity history is insufficient for reliable deployment of prediction-based purchasing.** A capstone demonstration can show the working pipeline and honest evaluation; it must not claim a high accuracy percentage from these records.

## Measured results on the uploaded data

The original `CUST-REF-TRANS.xlsx` and `Inventory-npg.xlsx` were reprocessed as of 2026-10-12. Their dates and quantities were not changed. As confirmed by the store, quantities on rows referencing an SI# are actual sales; STOCK rows remain purchases. Ambiguous dates, allocations and duplicates remain excluded for review.

The recovered dataset contains **759 accepted sales-linked quantity lines**, aggregated into **757 daily observations for 709 parts**. Only **two parts** satisfy five positive-sale days and at least 35 days of history. Their latest observations are **18 July 2019** and **7 March 2023**. The latest sale anywhere in the extract is **5 September 2026**, but that does not make those two eligible histories current. **Zero parts meet both the history and current-freshness requirements.**

Actual quantities for accepted lines do not establish complete sales coverage. Missing daily rows were treated as zero within historical series for this diagnostic comparison; those zeros are not verified sales records. No stockout history was supplied.

### Planning-period tests matching the application

For each origin, train a new XGBoost model using only earlier records, then forecast the entire future period recursively. A tested part must already meet the history minimum before the origin and have records spanning the period. Holdout quantities cannot become lag inputs or training targets until that period ends. At most three non-overlapping origins are used. Parameters are fixed, not tuned on these results.

| Planning period | Tested part-periods | Tested parts | MAE, units per part-period | RMSE, units per part-period | WAPE, quantity error |
| --- | ---: | ---: | ---: | ---: | ---: |
| 14 days | 3 | 1 | 13.3333 | 23.0940 | 100.0000% |
| 30 days | 3 | 1 | 13.3379 | 23.0940 | 100.0345% |
| 60 days | 3 | 1 | 13.6485 | 23.0934 | 102.3635% |
| 90 days | 2 | 1 | 20.6490 | 28.2854 | 103.2450% |

Each comparison has only one period with positive recorded demand, so these are very weak evidence for broader accuracy. The 30-day periods run from **8 December 2022 through 7 March 2023**. Across them, actual recorded demand is **40 units**, while XGBoost predicts **0.0138 units**. A simple recent-sales average has MAE **13.3333** and WAPE **100%**. The model does not beat this baseline or the zero-sales diagnostic. Zero is a comparison, not a restocking policy.

### Earlier one-day diagnostic, reproduced

The exploratory daily holdout covers **3 March 2022 through 7 March 2023**, with **370 part-day rows and only five positive days**:

| Metric | XGBoost, equal weights |
| --- | ---: |
| MAE | 0.4055 units per part-day |
| RMSE | 3.5641 units per part-day |
| R² | -0.0131 |
| WAPE | 100.0349% |
| Recorded / predicted quantity | 150 / 0.0557 units |

The older 12-block exploratory 30-day comparison is also reproduced: MAE **9.16596**, RMSE **20.20656**, WAPE **99.992%**, with **110 recorded units versus 0.008 predicted**. It uses different origins and eligibility, so its scores must not be substituted for the application-matching tests above.

**Interpretation:** MAE and RMSE are errors measured in units; lower is better. WAPE is total absolute error divided by recorded demand. Near 100% error here means almost all recorded demand was missed, not that the forecast is 100% accurate. R² is a fit score, not a percentage of correct predictions. Many assumed-zero days can make daily MAE look small even when every important sale is missed. Do not convert `100 - WAPE` into a claimed classification-style accuracy.

## What was improved

- Forecast charts query only the latest completed run, so earlier runs cannot mix into or truncate the current 90-day series.
- Error displays retain four decimal places instead of rounding a small MAE to zero.
- Every new training run saves validation for its chosen 7–90-day horizon, with MAE/RMSE/WAPE, recorded/predicted totals, positive test periods, and recent-average/zero comparisons.
- Validation refits before each period and checks eligibility using past data only. Insufficient history or a zero-demand holdout is labelled clearly instead of inventing an accuracy score.
- Recursive inference batches parts by date, keeping each part's own lag history and reducing repeated model calls. Invalid/nonfinite model output is rejected.
- Imported quantities, absent-day assumptions and sparse tests remain visible limitations. Current stale/future-date safeguards remain enforced.
- The import screen explains that inventory reimports replace stock counts, and forecasting imports replace the previous imported training history.

No model was chosen or tuned to make this inadequate holdout look better. Better software validation does not manufacture more historical observations.

## Is it good for defense?

The supplied Chapter 3 specifies **MAE and RMSE** for forecasting evaluation. The figures above can be reported honestly, with the baseline, dates, quantity coverage and holdout method. Literature accuracy figures are results from other datasets, not PartCast measurements.

The system can demonstrate its working forecasting pipeline, but **it is not ready to defend a claim of accurate current-store demand prediction**. The project should present the poor historical results and limited data explicitly, or obtain complete recent records and perform a new independent evaluation before making that claim. Technical tests do not establish user-survey results or guarantee a defense outcome.

Suggested wording: “PartCast implements XGBoost forecasting and evaluates unseen planning periods. Our supplied extract has actual recovered quantities but incomplete and stale product histories. Historical quantity error is about 100%, so the implementation is a prototype and forecasting effectiveness is not yet established for NPG's current inventory.”

For stronger evidence, collect roughly 6–12 months of complete sales for representative parts, in their correct base units. Keep a final independent period untouched for testing. Compare XGBoost with recent averages and intermittent-demand methods using the same dates and horizons; report bias, stockouts, missed units and per-part results as well as overall errors. Required business accuracy should be agreed with the store rather than invented after seeing test scores. Longer history alone cannot guarantee accuracy.

## Is deployment ready now?

**Local implementation is tested; hosted deployment and accurate forecasting are separate prerequisites.** A controlled inventory pilot can use staff-reviewed stock limits. Prediction-based buying is not validated by these results. Current uploaded histories correctly produce a readable stale-history error instead of fabricated current forecasts.

This review could not reach either Render service: HTTPS proxy connection attempts returned **403 CONNECT denial**. That is a workspace access limitation, not evidence that the public website is down. Live Render deployment, database availability and real supplier/login delivery remain unverified.

The cloud environment also still has a server service-role key and frontend public key for another Supabase project, plus a dedicated integration-encryption key shorter than 32 characters. Correct these privately in cloud settings. This observation does not establish the values configured in Render. Preserve the original encryption key used for existing saved Google connections.

Deploy both services from the saved branch with matching Supabase keys and the root Dockerfile. Verify `/health`, password-plus-Gmail-code login, authorized imports, and one actual training run with eligible recent data. No SQL migration is added for this prediction update: new metrics use the existing JSONB field. A store still missing earlier migrations must apply those first.

## Do I need to reimport inventory?

**No, if the parts and current stock are already correct.** Inventory is a stock snapshot; it cannot replace dated quantities sold.

If a reimport is needed:

1. Synchronize pending offline transactions. In **Backups**, create and download a backup.
2. Check that the inventory workbook contains today's actual shelf counts, exact part numbers, descriptions, units and prices. Old snapshot quantities can overwrite current counts.
3. Open **Import spreadsheets**, choose **Inventory and purchases**, select the checked workbook and import. Review imported/skipped results and compare sample parts with the shelves.
4. Separately choose **Sales quantities for forecasting** and import the full reviewed quantity history. Required columns are `Date`, `Part Number`, and `Demand Quantity`. Use real sale dates in `YYYY-MM-DD`, actual sold quantities and matching inventory identifiers. Keep the one-unit proxy option off.
5. This forecasting importer replaces prior `imported_training_data`; actual sales recorded in PartCast remain. Include all imported history you intend to retain, and avoid importing sales already recorded through Sell or receive as a second dataset.
6. Open **Plan ahead**, choose the horizon, update, and review the full-period test results. Reimporting the same old files will not make their history current or their predictions reliable.

Do not redate old invoices or add invented transactions to satisfy the history gate. Record real daily sales and document missing coverage and stockouts.

## Reproduce the audit

After preparing the actual-quantity CSV using [the confirmed raw-data procedure](FORECASTING_DATA.md):

```bash
.venv/bin/python ml/evaluate_forecast.py \
  --csv /path/to/actual-demand-daily.csv \
  --output /tmp/partcast-prediction-audit.json \
  --as-of 2026-10-12
```

Use the actual review date for a new review. The JSON contains source provenance, eligibility, baseline comparisons, dates and individual historical periods. Keep the customer source files and detailed review outputs private. The CSV SHA-256 for this review is `94d9d4a5613f91bda4990abbc802ff96eebad07ce18eac48df67633bab90ab5e`.

Verification: **46 server tests, 22 Python tests, 17 frontend unit tests and 7 affected Chromium tests passed**, plus the production PWA build. The server tests include real PostgreSQL and real Node-to-Python XGBoost execution. Browser/provider requests are mocked. A separate synthetic 12-part, 200-day runtime case generated **1,080 valid 90-day estimates** and a model artifact in approximately **2.0 seconds**; this checks runtime, not real-store accuracy or maximum production load. The actual uploaded dataset was separately rejected as stale, with no forecast/model artifact written. No hosted migration, data import or deployment was performed.
