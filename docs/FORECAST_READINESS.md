# When actual sales are ready for XGBoost

The former HTTP check rejected fewer than 30 input records before inspecting their dates or parts. This was not the Python engine's actual requirement: a few dated sale events can create enough lag-feature rows over a longer history, while hundreds of duplicate same-day rows cannot establish five distinct sale days.

`GET /api/forecast/readiness` now runs `ml/train_forecast.py --check-data` for a verified manager. It uses the engine's validation, per-part eligibility, feature generation and chronological split without fitting a model, writing a forecast run or modifying observations. Training repeats this check against a fresh database read before creating a run. The default excludes transaction-count proxies. The response reports per-part sale days, calendar span, last sale and exclusion reasons, plus aggregate counts and training/test row counts when available.

Minimum engine gates remain: five distinct positive sale days per part, a history spanning at least 35 inclusive calendar days, latest usable sale no more than 31 days before the store date, at least 30 feature rows after lags, and enough distinct dates/rows for chronological training and testing. Five or 35 alone do not guarantee enough features. The 31-day freshness rule is a conservative existing policy, not proof that every intervening day is observed or that slow-moving parts have no demand.

On **Plan ahead**, the history-check panel explains missing data in English and Tagalog, supports searching individual parts, and links to actual-sales import and sale entry. Updating estimates is disabled while checks are pending, unavailable or unsuccessful. The server independently enforces eligibility. Readiness is not cached for offline use. Previous completed forecasts are preserved when a check fails; their age and separate accuracy results still matter. Passing minimum checks does not establish operational accuracy or complete recording coverage.

## Supplied owner-labelled workbook, 15 October 2026

The `OWNER_ACTUAL_DATA` sheet contains the same 23 dated records for nine parts as `VERIFIED_HISTORY`. Two parts meet minimum historical sale-day/span requirements; none has a usable recent sale. The latest record is **17 May 2024**. This review concerns the supplied sheet, not a fresh inspection of the live database.

All 6,570 date/part/quantity triples in the train, validation and test sheets exactly match the prior simulated workbook. Their metadata now says `owner_informed_model` / `MODELED_DAILY_HISTORY`; this does not establish observed transactions. Regular imports reject those declarations and the `DAILY_MODELED_HISTORY` worksheet before any store mutation. The separate demo accepts the updated model label, preserves it as `source_tier` in the Python input, and evaluates it as `SIMULATED_DEMO`. Actual quantities never enter those demo splits.

For an actual-history replacement, copy only `OWNER_ACTUAL_DATA` columns A–E to a new workbook and include the rest of the verified history you want to retain, avoiding duplicate part/date quantities. Choose **Import spreadsheets → Sales quantities for forecasting**. A successful training import replaces previously imported training observations; it does not replace inventory counts or sales entered through PartCast. A partial 23-record extract is not a substitute for a complete, recent sales ledger. Verify skipped part numbers and record every subsequent actual sale.

## Validation

- Python tests cover sale-day aggregation, stale history, invalid/future records, lag-feature sufficiency, evaluation gates and a readiness check that never fits a model.
- The real HTTP test checks password/email-code/role enforcement, no writes when history is unusable, proxy exclusion, and a complete XGBoost run from five observed-event fixture rows spanning 71 days. It stores only into stubbed model/forecast destinations.
- Browser checks cover the disabled update action, per-part reasons, refresh after data changes, successful update submission, mobile layout and Tagalog, alongside the existing demo/import flow.

No new API key or database migration is required. No uploaded quantities, source dates, live inventory or actual sales were changed for this fix.

## Slow history checks on Render

The history and engine-status requests allow 90 seconds in the browser. The API bounds cold interpreter discovery to 45 seconds and the history calculation to 30 seconds; ordinary API requests retain their 20-second limit. Previously, the browser could abandon a valid calculation after 20 seconds while Python was still checking. After eight seconds the history panel explains that the check is still running. Navigating away cancels that browser request, and simultaneous checks of identical inputs share one calculation without caching a completed eligibility result.

The history CLI loads NumPy and pandas, with the exact same data/feature/evaluation rules as training. XGBoost and scikit-learn model/metric imports are deferred until fitting, reducing the memory and startup work of checking history. Engine discovery still verifies the complete installed forecasting dependencies. An interpreter startup timeout or host memory kill stops further expensive interpreter attempts and reports its actual cause rather than claiming packages are absent.

Apply the matching API and website releases on Render, wait until both are Live, then reload **Demand planning** and choose **Check sales history again**. The native Node API still needs the [Python build/start commands](RENDER_PYTHON_SETUP.md). Do not reset Supabase or reimport quantities to fix a request timeout. A successful request can legitimately report sparse or old sales; the supplied 27-record history remains insufficient for a current forecast.

Validation includes a real browser response delayed for 25 seconds, concurrent history checks, a stalled-interpreter regression, a history CLI that refuses model-library imports, and the actual XGBoost forecasting integration. Hosted authenticated checks require a current staff session and are separate from the public `/health` check.
