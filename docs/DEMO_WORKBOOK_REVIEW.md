# Uploaded capstone workbook: XGBoost demo

The supplied `PartCast_Capstone_Forecasting_Improved.xlsx` contains explicitly simulated demand for nine source-identified part numbers. The workbook's approximate 12.30% test WAPE belongs to a 365-day moving average, not XGBoost. Its synthetic schedules and zero-demand days do not establish actual store sales or operational forecasting accuracy. The raw upload remains private and unchanged.

## Measured comparison

The new experiment actually fits both XGBoost strategies with the repository's fixed model parameters. It uses the workbook's exact chronological splits, preserves explicit zero days, and rejects missing calendars, duplicate part/date rows, different part sets, invalid quantities, mixed actual/synthetic tiers and overlapping dates.

| Split | Dates | Daily records | Simulated units |
| --- | --- | ---: | ---: |
| Training | 15 October 2024–16 June 2026 | 5,490 | 3,217 |
| Validation | 17 June–15 August 2026 | 540 | 327 |
| Test | 16 August–14 October 2026 | 540 | 316 |

| Method | Validation WAPE | Test WAPE |
| --- | ---: | ---: |
| **Direct 30-day XGBoost** | **8.6155%** | **17.5016%** |
| Recursive daily XGBoost | 21.9933% | 47.3605% |
| Recent 28-day average | 11.7736% | 21.1573% |
| 365-day average | 9.2204% | 12.3028% |

The XGBoost strategy is selected by validation WAPE before evaluating the test periods. Direct XGBoost has test MAE **3.0725 units per part-period** and RMSE **5.0789** across **18 part-periods**: nine parts times two complete 30-day periods. Test quantities total 316 simulated units versus 292.7235 predicted. WAPE sums absolute errors for each part-period before dividing by total actual units; it does not allow errors on different parts to cancel.

Each period is fitted using only earlier dates. A completed period can enter history before the following period begins. The final demonstration model is fitted on all supplied synthetic history after evaluation, and produces nine 30-day totals for 15 October–13 November 2026. Daily sale timing and statistical confidence intervals are not claimed.

This is a reproducible simulation comparison. The workbook and test outcomes have already been inspected; these are not fresh independent real-store results. The 365-day average still performs better than XGBoost on the test set and remains visible. There was no search over generated quantities, dates, random seeds or XGBoost parameters to force a target score. Earlier 100.33% actual-extract and 104.39% hosted-store errors use different data and cannot be presented as before/after improvements from this simulation.

Source SHA-256: `786f986ec476fdec7747ada97d42ced708ff230a44bae87ac227b5b4a4a12ec4`.

## Website workflow

After deploying this branch to both the Render API and static site:

1. Sign in using password followed by the required email code, as Super Admin, Owner or Admin.
2. Open **Plan ahead** and expand **Forecasting demo · simulated data**.
3. Choose the uploaded capstone workbook and select **Test XGBoost demo**.
4. Review the simulated WAPE, MAE, method comparison and next-period totals. Actual store forecasting remains separate.

`POST /api/forecast/demo/jobs` returns a background job immediately; `GET /api/forecast/demo/jobs/:id` checks its progress and result. Both require authenticated, email-verified manager access, and a job is visible only to the account that started it. Starts are limited to four per account per 15 minutes, with one demo running at a time per API instance. This avoids holding a long upload response open while Python runs: the first synchronous hosted trial hit an HTTP 502 gateway response even though the API remained healthy. Completed results expire after 30 minutes, with at most eight retained in private process memory; a service restart requires running the demo again.

Uploads use the bounded non-evaluating spreadsheet parser. Python receives only the three explicit demo sheets, not cached backtest scores or `VERIFIED_HISTORY`. Temporary files are private and removed after processing; demo results are not written to Supabase, inventory, actual sales, production forecast runs or automatic supplier recommendations. No schema migration or new API key is needed. The older synchronous `/api/forecast/demo` route asks cached clients to refresh instead of starting another long request. Demo status responses are excluded from offline caching.

The regular forecasting importer now rejects workbooks declaring synthetic/simulated demand before creating an import batch or changing any store history. Renaming the file cannot remove its row-level declaration. Keep full demo workbooks out of actual training imports.

## Live store inspection

On 15 October 2026, supplied-account sign-in and Gmail email verification succeeded. The hosted API reported the engine ready, with **4 actual-sale records**, **187 older imported training records** and no proxy observations. The latest live 30-day historical WAPE was **104.39%**, testing one recorded unit across three periods of one part. Its next-day WAPE was a different measurement, **347.0206%**, on three recorded units. These limited figures do not establish reliable current-store accuracy. The new synthetic workbook was not imported into actual history.

Verification includes the real uploaded workbook through Node → Python XGBoost, Python tests preventing final-test labels from selecting or fitting their own predictions, an HTTP test proving synthetic imports cannot write store history, frontend translation/unit tests, a PWA production build and a browser flow at phone and desktop widths in English and Tagalog. Deployment and live demo results must be checked separately; a local successful run or GitHub push alone does not establish a Render rollout.
