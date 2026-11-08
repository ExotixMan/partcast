# Production v2: changes and system-review answers

This branch starts from `b56be6d40627b7edc76287e1341c96c8ae410a0d`. It retains that version's Chart, Daily list, Summary and complete active-part selector. The entire `ml` directory is restored byte for byte from that commit. Application-level source separation, refresh, validation and failure diagnostics remain in place. No sales are generated or inserted by these changes.

## What changed?

- The planning selector offers 14, 30 and 60 days. Advanced settings and the API accept whole planning horizons from 7 through 60; an existing custom value in that range is displayed correctly. New 90-day application requests are rejected by API, settings validation, the trainer and runtime adapter before Python starts. The standalone ML scripts retain their original internal range because their source is restored exactly.
- At API startup, an older saved 90-day setting is replaced with 60 using the durable refresh queue. An already-running job is not duplicated or cancelled; the replacement remains pending under the existing lease rules. This requires no database migration. Historical 90-day runs remain in update history; they are not relabelled as 60-day tests or served as current planning forecasts.
- Sales labels use **Total sold**, **Recorded transactions**, and **Days with recorded sales**. Counts, quantities and data-source labels keep their separate meanings. Generated demo data remains labelled as samples.
- Inventory uses **Opening stock quantity** and **Increase/Reduce stock count**. Corrections report that the stock count was corrected rather than claiming that a supplier delivery arrived.
- The Summary bar uses **Stock coverage**, bounded from 0 to 100%. Small shortages are retained to four decimals. A period's estimated shortfall is not presented as the next supplier order.
- Chart, Daily list, Summary and the selected run's metrics use the same run. Missing forecasts are unavailable, not zero-demand forecasts. Current stock and recorded sales refresh independently of forecasting; the selected part has a five-second online/visible fallback when live events are missed. The chart contains Recorded sales and Estimated demand only. Projected stock has been removed from chart data, tooltip and legend; Summary still shows current stock, projected remaining stock, coverage and shortfall.
- Forecasting uses the original recursive daily XGBoost implementation from `b56be6d`. The additional Daily timing test panel and learned daily-allocation implementation have been removed. Source rules exclude declared/generated records and de-duplicate referenced imports without deleting database records. Failed updates retain a safe stage/reference; they do not display fabricated accuracy results or replace a completed forecast.
- Forecasting-history replacement requires a signed review, rejects invalid rows, and commits the entire history, receipt and refresh request in one database transaction. Migration 0015 also blocks the old direct-write path. Retry receipts and stale-review checks protect newer imports. See [safe forecasting imports](SAFE_FORECAST_IMPORTS.md) for deployment and limits.

## Why can stock be added in both Inventory and Sell or receive?

| Action | Purpose | What happens |
|---|---|---|
| Inventory → Add a new part | Create a new catalog item and its opening balance | Saves the part's identity, prices, limits and opening stock; records the opening movement. |
| Sell or receive → Receive delivery | Receive a physical delivery of an existing part | Increases stock and saves the delivery transaction, quantities, costs and any supplier/reference details. |
| Sell or receive → Sell parts | Complete a customer sale | Reduces stock, records the sale and creates actual sold-quantity observations for forecasting. Credit sales also update customer balances. |
| Inventory → Adjust stock | Correct a discrepancy found while counting, or record damage/missing stock | Increases or reduces the count with a correction reason; it is not a customer sale. |

Both opening stock/corrections and deliveries can increase a balance, but they represent different events. Record each physical delivery once in Receive delivery. If a new part will be received next, create it with zero opening stock and then record the delivery. Do not enter the same quantity as both opening stock and a new delivery. Adjust stock is for a documented count correction.

Receiving stock, opening balances and stock corrections are not sales-demand training examples. Only actual sold quantities and eligible imported sales history are used for the store forecast.

## What does Total sold mean?

It is the sum of recorded quantities sold for a part within the selected date range. It is a number of units, not a peso amount or a count of receipts. **Recorded transactions** counts that part's sales entries saved through PartCast; **Imported records** counts eligible imported entries. The Sales by part page aggregates quantities. The Recorded transactions tab shows individual saved sales, while Imported invoices shows uploaded historical bills.

An imported invoice without an identified part, dated quantity and usable matching record cannot supply an invented quantity to the forecast. No-record dates in the sales report remain unknown.

## Which features are actually used for forecasting?

A feature is an input to the model. An error metric is a result used to evaluate predictions. The production model does not send the forecast to a chatbot or obtain a weather forecast.

| Information | Used for demand prediction? | Implementation |
|---|---|---|
| Past quantities sold | Yes | Daily quantities associated with a product and date; lags of 1, 7, 14 and 28 days. |
| Recent sales level and variation | Yes | Rolling means and standard deviations over 7, 14 and 28 days. |
| Sales frequency | Yes | Positive-sale counts and rates over 7, 28 and 90 historical days. |
| Calendar | Yes | Day of week, day of month, month, ISO week and weekend indicator. |
| Product identity | Yes | A numeric code identifies the product within the pooled model. It does not derive the brand from the SKU. |
| History timing | Yes | Days from the beginning of the history and days since observed demand. Unobserved recent gaps are projected recursively up to the original 31-day freshness limit. |
| Weather | No | No weather service or weather variables are used. |
| Brand | No | Stored for inventory/search; absent from the forecast feature matrices. |
| Selling price / cost | No | Used for sales amounts, valuation and purchase costs, not demand prediction. |
| Category | No | Used for inventory/report filters, not as a demand predictor. |
| Current stock / stock limits | Not a demand-model input | Used after forecasting for projected stock, coverage and restock decisions. |

Removing the 90-day **forecast option** does not remove the 90-day **historical lookback**. A historical feature window is past evidence, not a request to forecast 90 future days.

The restored production model predicts daily quantities using XGBoost with 320 trees, maximum depth 5, learning rate 0.04, subsample/column sample 0.9, regularization alpha 0.08 and lambda 1.2, and the Tweedie regression objective. It projects future days recursively: earlier predicted quantities enter later quantity lags and rolling features. Future event counts and event age use observed-sale history rather than declaring predicted quantities to be observed sales. The original recursive behavior, including its sensitivity to earlier predictions, is restored without adding random fluctuations.

## Which metrics measure the results?

For each tested product-period, let `A` be recorded units, `F` forecast units, and `N` the number of tested product-periods:

- `MAE = sum(abs(A - F)) / N`, measured in units per product-period.
- `RMSE = sqrt(sum((A - F)^2) / N)`, also in units; larger misses receive more weight.
- `WAPE = sum(abs(A - F)) / sum(A) × 100`. It is undefined when total recorded demand is zero. It is not an accuracy percentage, and `100 − WAPE` is not a validated accuracy score.
- `R² = 1 − sum((A - F)^2) / sum((A - mean(A))^2)` is retained as an internal saved diagnostic. It is no longer displayed in the demand planning results. It can be negative and is undefined when the actual quantities have no variation.
- `Recorded / forecast units` are `sum(A) / sum(F)` across the same tests. They are totals, not software unit-test counts.

The same part tested in two different historical periods contributes two product-periods. Repeating an already saved test does not create a new independent period.

The model is refitted before each historical test period. Sales in the tested period are not used to fit the model being tested. The original top-level metrics come from the chronological one-day-ahead holdout. The planning-period panel uses complete-period recursive validation. They measure different horizons and must not be mixed. The additional Daily timing test comparison is no longer shown. All eligible test windows remain in the report, including poor results. The recent-sales-average comparison is retained.

The original one-day holdout can have the same scores for several requested forecast horizons when its historical training/test data is unchanged. Whole-period errors can differ because those tests evaluate the chosen horizon. The engine also retains its original MAPE and bias diagnostics.

In the supplied screenshot, `4.4703` means about 4.47 units of average absolute error per tested product-period. `26.7934%` is WAPE, not a 73.2066% accuracy claim. `3,487 / 3,068.006` means 3,487 recorded units and 3,068.006 forecast units in those tests. The rounded screenshot alone does not supply the original error pairs or test count needed to independently recompute every value. The UI now uses Philippine number formatting, so decimal points and thousands separators do not depend on an unrelated browser locale.

## What does Stock coverage mean?

`coverage = min(current stock / estimated demand × 100, 100)` when demand is positive. No percentage is asserted when estimated demand is zero.

Using the displayed example of 39.7 estimated units and 2 on hand, coverage is approximately `2 / 39.7 × 100 = 5.0%`. The earlier roughly 1,986% figure represented demand relative to stock; it was not forecast error or a usable percentage-filled stock bar. Exact calculations use unrounded estimates.

`remaining stock = max(0, current stock − cumulative future estimated demand)`. This remains a Summary calculation; it is not a chart series.

`period shortfall = max(0, estimated demand − current stock)`; the whole-unit planning gap rounds this shortfall upward. This is the period's expected gap. The next order still follows the store's small-purchase policy and staff review in Restock. No future deliveries are assumed.

A daily prediction such as 0.4 is an expected quantity. It does not describe selling 0.4 of a physical piece. Rounding every low daily prediction down to zero would incorrectly erase the period's expected demand.

## What establishes data reliability?

`Daily_B_Usable` is a worksheet/import label stored in `source_reference`; that label alone does not verify receipts. Its classification as actual history follows the owner's earlier confirmation. The original workbook and business documents are needed to establish where its figures were prepared. Later declared/generated records stay excluded from actual-store forecasts, even when they use genuine inventory part numbers.

Historical test scores describe the recorded sample. Missing sales and stockouts can hide real demand. Independent later sales are still needed to establish future performance. Source names, a large row count or a lower error on already reviewed data do not establish store-wide reliability.

## Code references

- Original forecast input columns, recursive prediction, error formulas and chronological tests: `ml/train_forecast.py`.
- Source selection: `apps/server/src/utils/forecastData.js`.
- Stock coverage and shortfall: `apps/web/src/lib/forecastSummary.js`.
- Sales terminology and source counts: `apps/web/src/components/SalesSummary.jsx`.
- Horizon validation and legacy-setting upgrade: `apps/server/src/utils/forecastPolicy.js` and `apps/server/src/services/automaticForecasts.js`.
