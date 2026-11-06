# Forecasting data

Demand means the quantity customers bought for an identified part on a known date. Receiving stock, current shelf quantity, invoice totals and item mentions cannot substitute for quantities sold.

## Import

Import a reviewed current inventory snapshot first so sales can match exact part numbers. Import past invoices through the historical-sales option. Import actual dated part quantities through the demand/training option, or use automatic detection when the workbook headers match. Read the result counts and unmatched-part warnings. A successful historical invoice import does not imply that usable quantity observations were added.

The importer recognizes reviewed training tables such as `Daily_B_Usable` and supported dated-demand columns. Keep source dates, quantities, identifiers and document references. A reference number does not establish a sale date. Do not shift old dates to today, assume missing quantities, merge similar identifiers by guessing, or count the same sale in imported demand and new counter transactions.

Raw workbooks and preparation packs live in the separately delivered private archive. Keep their original provenance. Some supplied spreadsheets contain generated daily quantities using real part numbers; their origin remains simulated even if renamed or owner-approved. Normal store imports reject declared simulated rows. The separate `/forecast-demo` workflow evaluates the labelled example without replacing store history.

## Readiness

Current forecasting checks each part for at least five distinct sale days across 35 calendar days, with usable observations in the latest 31 days. Enough rows must remain after lag creation and chronological evaluation. Future dates and unsupported sources are excluded. Passing these conditions establishes eligibility, not accuracy. A database reset does not create the missing sale observations.

The historical invoices and usable demand rows are different counts. Thousands of invoice rows may produce few usable observations if quantities, dates or exact inventory identities are absent. Keep recording every actual part and quantity through Sell or receive; each confirmed sale creates a demand observation automatically.

Production XGBoost predicts the selected planning-period total directly from lag, rolling, calendar and intermittent-demand features. Expected daily chart values allocate that total across the period; they do not predict exact sale dates. Missing recent observations are an explicit gap feature, not recursively invented sales. Training examples use completed historical targets and are bounded before fitting. Where the model constructs an internal daily timeline, missing dates still enter as zero under the recorded-history assumption; those dates are not independently confirmed zero-sales days. Stockouts and incomplete recording can hide real customer demand.

Production training excludes labelled simulated references and the later generated `training:<product_id>:<date>` convention, even if those rows were relabelled as imported training data. Referenced duplicate imports cannot double-count demand; distinct customer sales are preserved. Records are not deleted. Unknown provenance still requires review. See [forecast logic review](FORECAST_LOGIC_REVIEW.md) for the paper requirements, fixes and validation limits.

## Evaluation

Training and test periods are chronological. Evaluate complete planning periods such as 30 days; holdout sales cannot choose or fit the model being tested. The application reports unit error, WAPE, actual/predicted totals and a recent-sales-average baseline. MAE expresses average units missed. WAPE is total absolute error divided by total actual quantity; lower is better. WAPE is undefined when no actual quantity was sold and is not a classification accuracy percentage.

A lower WAPE on one small or simulated sample does not establish actual-store accuracy. If XGBoost is worse than the baseline, disclose that and use staff review before ordering. Confirm performance on later independent actual sales and across the parts the store will buy. Keep failed or weak periods in the report; do not edit real sales to improve a score.

`ml/evaluate_forecast.py` uses the current direct-period XGBoost strategy and the production freshness gates for its `planning_period_validation` results. Its separate exploratory comparison, `ml/benchmark_raw_forecast.py` and `ml/compare_forecast_candidates.py` include legacy daily strategies for comparison; those are not the current production scores. Python tests cover time boundaries, quantities, sparse histories and validation isolation. See [Verification](VERIFICATION.md) for the limits of current checks.

## Purchasing

Demand estimates guide the next stock review. Restock also includes active parts at or below their stock limit, independently of forecasting. The owner's buying policy limits suggested purchases to one or two units per part at a time. Review actual shelves, recent sales, supplier delivery time and the edited supplier email before ordering. A predicted fractional daily quantity is an average, not a fractional physical purchase.

## Default lower-error display

Demand planning defaults to current forecasts whose **per-part historical WAPE is at most 20% across at least two complete, distinct, non-overlapping test periods** from that same completed run and planning horizon. This is an owner-selected visibility rule, not a scientifically established accuracy guarantee. Every available test window for the part is included; a favorable subset is never selected. Missing, conflicting, overlapping, future or invalid tests, and zero total recorded test demand, cannot establish eligibility.

The server derives these assessments from the run's stored `horizon_validation.windows`. No database migration or model retraining is needed to classify existing complete results. Parts with insufficient evidence, higher error, or no current estimate remain accessible through **All parts** with review labels. If no part qualifies, the default view explains that condition instead of silently showing weaker estimates or raising the limit. Per-part responses carry their own assessment so a newly completed run cannot expose a now-disqualified chart under the default filter.

This changes presentation only. Training inputs, forecast outputs, stored historical windows, baseline comparisons and full-model MAE/RMSE/WAPE/R² remain unchanged. The overall results explicitly cover all tested parts, including those outside the default view; the system does not relabel a filtered subset's score as full-model accuracy. Historical results still depend on recorded-sales coverage and do not guarantee future sales.

The stock-summary percentage is **stock coverage**: `min(100, current stock / predicted demand × 100)` when predicted demand is positive. For example, 2 units on hand against about 37.2 estimated units gives about 5.4% coverage and about 35.2 units short. This replaces the former demand-to-stock ratio, which could legitimately exceed 1,000% but was difficult to interpret as “consumption.” Coverage is independent of forecast error and does not indicate predictive accuracy. Zero estimated demand has no coverage ratio, so the interface shows a plain explanation instead of inventing a percentage.
