# Forecast logic review for the November 8, 2026 defense

This describes direct-period forecasting with a learned daily timing profile (`xgb-pattern-period-`). Earlier Q&A documents describing 320-tree recursive daily forecasting apply to the previous version.

## Paper requirements

The supplied 43-page paper, “PartCast chapter 1 revised, chap2&3(not checked yet) (1).pdf”, requires XGBoost Regression, historical part-level records, forecasts only where sufficient history exists, staff-reviewed purchasing, and regression evaluation. Physical PDF page 9 specifies XGBoost and decision support; page 11 describes data-quality limitations; page 40 names MAE and RMSE. It does not prescribe an accuracy percentage or guarantee that machine learning beats a baseline.

The actual implementation uses React, Node/Express and Supabase/PostgreSQL. Physical PDF page 37 names Laravel and MySQL. Update that methodology description before presenting; the code changes do not rewrite the paper or migrate the application stack.

## Corrected behavior

1. **Period demand:** production XGBoost learns completed planning-period totals directly. It does not feed forecast quantities back as new history. Targets are normalized using only the preceding observed 90-day mean to reduce scale differences across products; predictions are returned to units afterward. The fixed regularized model uses 200 trees, depth 3 and learning rate 0.04.
2. **Daily chart values:** a second XGBoost model learns relative daily expectations from past lags, rolling statistics, calendar dates, forecast lead, time since the last observed sale, recent sale sizes, and the median/consistency of recent sale intervals. These weights allocate the independently estimated period total with exact four-decimal conservation. Training uses past-only features and completed daily targets, capped at 20,000 rows with a fixed seed. The seed samples actual training examples; it does not add random sales or chart noise. Both models use 200 trees, depth 3 and learning rate 0.04. Uniform allocation remains an explicitly stored fallback when daily targets or positive weights are insufficient. Daily dates are expectations, not guaranteed transactions. The chart joins actual predicted points with straight segments rather than inventing a smoothed curve. Existing page layout is retained.
3. **Missing recent history:** the last recorded positive-sale date and the gap to the forecast origin are represented explicitly. The algorithm does not invent intervening sales. Parts older than 31 days remain excluded. A new observation or confirmed coverage is needed for stale items; stock quantity alone is insufficient.
4. **Sufficient period training:** a product must have completed targets for the requested horizon, and the pooled model needs at least 20 training windows. Overlapping training windows are supervised samples, not independent validation periods. Training examples are bounded to 20,000 before fitting. Products without a represented training target are not assigned a forecast by borrowing another product's identity.
5. **Period evaluation:** the same direct strategy is refitted at historical origins and scored on complete later periods. Features, normalization and targets used for fitting precede the tested period. MAE, RMSE, WAPE and R² on the page refer to the selected planning horizon. Daily MAE/RMSE/WAPE are reported separately on complete part-day forecasts from the same held-out periods, alongside a uniform allocation comparison with identical totals. Undefined WAPE/R² remain undefined. Existing older runs keep their stored history; their period scores are shown instead of mixing daily and period errors.
6. **Source separation:** actual counter sales and owner-identified `Daily_B_Usable` imports remain eligible. References marked simulated/synthetic, or matching the later generated `training:<product_id>:<date>` convention, are excluded from production forecasting and its history view. Rows are not deleted from Supabase. Unrecognized or missing references cannot establish provenance and still need owner review.
7. **Duplicate imports:** an identical referenced part/date/source observation is counted once. Conflicting quantities sharing that identity stop forecasting with a review message. Distinct actual transactions on the same date are preserved and added normally.
8. **Chart history:** accepted imported demand and actual sales use the same source filtering as training. The historical line represents recorded quantities; missing record dates are not independently confirmed zero customer demand. The current internal-zero history assumption is still disclosed.
9. **Refresh consistency and stock:** displayed part totals use the same returned run as Chart and Daily list. A completion arriving between list and part requests cannot leave an older total displayed. Projected stock equals the greater of zero and current stock minus cumulative future expected demand; future deliveries are excluded. Demand can remain positive after projected stock reaches zero. The removed Summary view and error-filter controls remain absent.
10. **Deployment:** startup queues a replacement for an older forecast strategy if the durable queue is idle. Queued/running work is not duplicated; the existing lease protects publication. No migration, production sale insertion or stock mutation is needed.

## Earlier fuel-filter development check

The owner identified the uploaded `Daily_B_Usable` history as actual sales. Its fuel-filter example contains 44 positive observations, mostly about 20 units every 14 days, with a maximum of 22 and a last observation 30 days before the supplied forecast origin. The supplied deployed forecast contained 34.1103 and 112.5361 units on two days, together 99.5% of the 147.4063-unit period total.

A local diagnostic, fitted only on that supplied item, compared the previous recursive strategy with the direct strategy over three historical 30-day windows:

| Measure | Previous recursive diagnostic | Direct period diagnostic | Recent average |
|---|---:|---:|---:|
| MAE, units per part-period | 24.6559 | 5.0089 | 9.2381 |
| WAPE | 56.0361% | 11.3838% | 20.9957% |

Before the daily-profile extension, the direct development forecast was approximately 41.2985 units across 30 days, displayed as expected daily averages of approximately 1.3766 units with rounding distributed across days in 0.0001-unit increments. These are diagnostic results for that supplied item, **not** the deployed pooled model's independently measured store-wide accuracy. The historical records and earlier errors were already inspected while developing this fix. Do not present these development scores as fresh independent evidence or as a guaranteed outcome for every part.

The supplied item's last observation was October 7, 2026. On November 8 it will be 32 days old and fail the existing 31-day freshness rule. Supply genuine newer observations or establish a reviewed coverage policy; do not invent a new sale or shift dates to make the item eligible for a presentation.

## Complete supplied snapshot: daily-profile development comparison

The later full export supplied by the owner contains 37,301 observations. Source rules retain 730 (701 owner-verified imports plus 29 owner-confirmed actual transactions) and exclude 36,571 generated records without deleting them. Eight parts meet the current forecasting requirements. A confirmed newer 2-unit fuel-filter sale is included; this differs from the earlier item-only diagnostic above.

Both models are refitted before each historical test period. Period totals and their errors remain unchanged by daily allocation. Daily errors compare the same dates and totals:

| Horizon | Tested part-periods / part-days | Uniform daily MAE | Learned daily MAE | Uniform daily RMSE | Learned daily RMSE | Period WAPE | Daily WAPE |
|---|---:|---:|---:|---:|---:|---:|---:|
| 14 days | 10 / 140 | 1.0005 | 0.3792 | 1.9380 | 2.0375 | 79.6684% | 91.5412% |
| 30 days | 16 / 480 | 1.0938 | 0.3709 | 2.7747 | 2.6732 | 31.3419% | 64.9706% |
| 60 days | 17 / 1,020 | 1.2456 | 0.2307 | 3.3248 | 1.7111 | 16.1893% | 34.0079% |
| 90 days | 17 / 1,530 | 1.2609 | 0.1832 | 3.3809 | 1.3120 | 17.3738% | 26.1253% |

MAE and RMSE here are units per part-day. The 14-day RMSE worsens, and the 30-day fuel-filter case also has larger individual errors despite lower daily MAE. The period XGBoost does not beat the recent-average baseline at every horizon. No periods are dropped to improve these figures. These are development comparisons on already reviewed records, not untouched independent deployment results or evidence that all catalog parts are reliable. Missing-day coverage and stockout records still require review.

The model artifact remains an XGBoost JSON file; its attributes include the serialized second model, its feature names, training-row count and per-part fallback modes. Run metrics store `daily_validation` separately from `horizon_validation.model`. A replacement run is required; changing the chart alone cannot repair earlier stored estimates.

## What is still needed for real-store validation

The simplest export is [forecast_review_export.sql](forecast_review_export.sql). Run that read-only statement in Supabase SQL Editor and download its result as CSV. It returns one JSON cell containing all observations, relevant products and five recent runs, so an outer 100-row results limit does not truncate the inner observation array. Do not copy only the shortened on-screen JSON preview. No passwords, account profiles, OTPs or integration secrets are requested.

- A complete snapshot has now been reviewed. Export later current observations with `id, product_id, occurred_on, quantity, source, source_reference` for independent follow-up; do not rely on a truncated table preview.
- Download the complete product list, including IDs, part numbers and active flags. Preserve dates, quantities and references exactly.
- Keep a provenance list identifying actual counter sales, genuine imports and generated records. The owner identified `Daily_B_Usable` as genuine; verify original quantities against business records. A source label alone is not proof.
- Check whether no-record dates mean no transactions, missing recording or stockout periods. The application cannot infer unmet demand from inventory counts alone.
- Freeze a reviewed development snapshot. Evaluate later genuine sales on an untouched future period. Use identical parts/dates to compare XGBoost with the 28-day mean, Croston-SBA and TSB; retain weak results. The current release keeps XGBoost as required by the paper and discloses when it loses to the baseline.
- Set an acceptable unit error and purchasing-cost criterion with the store owner. There is no universal WAPE value that guarantees safe orders.

## Defense wording

“PartCast uses XGBoost to estimate total recorded demand for the chosen period. We evaluate MAE and RMSE on later historical periods and also report WAPE and simple baselines. We corrected recursive prediction feedback and separated generated records from production training. A second XGBoost model learns daily timing patterns and allocates the same period total. Daily and period errors are reported separately; neither establishes exact future sale dates. Development checks show the reported spike case improved, but actual-store reliability still requires complete records and independent future testing. Staff review all purchasing decisions.”

## Operational checks after deployment

Confirm a new completed model version starts with `xgb-pattern-period-`; inspect the filtered source counts and `data_quality` exclusions in the run metrics. The worker queues the upgrade automatically. If history is insufficient, it reports that condition rather than inventing a forecast. Inspect qualified parts in Chart and Daily list, verify their totals agree, then inspect the selected-period MAE/RMSE, baseline, and separate daily timing results under the existing historical test details. Review the fuel filter in the full tests even if it fails the planning-list eligibility rule. Existing cached PWA clients may need to accept the update. A passing local build does not establish hosted runtime capacity or full-dataset accuracy.

Earlier locally delivered Chapter 1–3 documents describing uniform daily allocation need this daily-profile extension reflected in their methodology before presenting them as the current implementation. The original paper still requires the stack correction described above.
