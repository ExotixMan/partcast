# Model improvement review — 14 October 2026

Later follow-up: [recursive sale-event features were corrected and intermittent references were evaluated](SPARSE_DEMAND_REVIEW.md). The same historical WAPE rose to 100.3285%; no accuracy improvement is claimed. The figures below describe the earlier implementation at commit `b21867266d7b0e39c1e0cded1520869e697a429a`.

**No reliable high-accuracy model can be selected from the present extract. No actual sales records were changed and no new parts were introduced.** The existing forecasting parameters remain in production code; the current historical quantity error remains about 100% as documented in [prediction readiness](PREDICTION_READINESS.md).

Improvement requires verified records and measured performance. Changing quantities/dates to obtain a favorable score would not measure the store's demand. Ambiguous STOCK/SI# allocations and invoices without an exact identified part remain in review rather than becoming invented training data.

## What was tested

Three fixed candidate profiles were compared using development data before the final 30-day period:

- Current XGBoost Tweedie model, unchanged parameters.
- Shallower, regularized XGBoost Poisson model for non-negative quantities.
- Shallower, regularized XGBoost squared-error model, with non-negative forecasts.

The final period, **6 February–7 March 2023**, did not participate in selection. Development data ends **5 February 2023**. Each candidate refits before its development period and forecasts that whole period recursively, using only the same identified parts. These records were already reviewed in earlier work, so moving their split does not create fresh independent evidence.

| Candidate | Development part-periods | Periods with recorded sales | MAE, units per period | Recorded / predicted units | WAPE |
| --- | ---: | ---: | ---: | ---: | --- |
| Current Tweedie | 3 | 0 | 0.0069 | 0 / 0.0207 | Undefined |
| Regularized Poisson | 3 | 0 | 1.9628 | 0 / 5.8884 | Undefined |
| Regularized squared error | 3 | 0 | 0.5916 | 0 / 1.7747 | Undefined |

There is no recorded demand in these development periods. WAPE cannot be calculated with a zero denominator. An always-zero forecast would have zero MAE here, but that would not establish the ability to predict a later sale. **No candidate was selected and the final-period candidate comparison was skipped.** The tool requires at least three positive development periods before ranking candidates; this is a transparent tool guard, not an industry accuracy standard or a promise of deployment readiness.

## Improvements implemented

- Missing/unidentified part IDs, invalid dates, boolean quantities, negative quantities and nonfinite values now produce explicit errors instead of being silently discarded or interpreted as sales.
- The API verifies that every returned forecast refers to a part identified in its input records. An external or incorrect model script cannot introduce an unidentified part.
- Returned dates must cover the full requested future horizon for each included part. Duplicate dates, out-of-period estimates, incomplete series and incorrect product/horizon counts are rejected before forecast/model storage.
- Candidate selection sees development-period results only. Changing the final-period quantities in synthetic unit tests cannot change which candidate is selected.
- Empty development periods cannot produce a fabricated percentage or automatic model recommendation. The main model's freshness and future-date guards remain enforced.
- New data-quality messages have Tagalog translations.

Sparse parts may legitimately be excluded from forecasting; the output guard does not require estimates for parts without sufficient history. No stock counts, sales, suppliers, customer balances or hosted database records were changed. This update uses the existing forecast schema and needs no new SQL migration.

## Record integrity

The accepted extract still contains **757 daily observations for 709 identified parts**, with **zero new part identifiers**. Its SHA-256 is unchanged: `94d9d4a5613f91bda4990abbc802ff96eebad07ce18eac48df67633bab90ab5e`.

The source workbooks are also unchanged:

| File | SHA-256 |
| --- | --- |
| CUST-REF-TRANS.xlsx | `37a9f9758389be60cb49e96fdea654b42995cb0adb7d0d30f7f8be958cdfa685` |
| Inventory-npg.xlsx | `9c0548887a792b68dd2e116627580fbd9da1842363f0fca747379be1e35d01f9` |

Hashes establish which files were used and that this work did not modify them. They do not prove that the original sales coverage was complete. Detailed outputs and uploaded records remain private outside Git.

## Reproduce the comparison

```bash
.venv/bin/python ml/compare_forecast_candidates.py \
  --csv /path/to/actual-demand-daily.csv \
  --output /tmp/partcast-candidate-comparison.json \
  --horizon 30
```

The comparison never writes the input CSV or changes the production model. Obtain complete, recent actual quantities for existing parts, resolve flagged dates/allocations against receipts, and reserve a genuinely new test period before asserting accuracy improvements. Inventory reimports alone do not supply that evidence.

Verification: **47 server tests** and **26 Python tests** passed; **17 frontend unit tests** and the production PWA build passed. The affected three Node forecasting tests were rerun after final output-guard changes. These include actual Node-to-Python XGBoost execution and tests that refuse unidentified parts, duplicate/out-of-period dates, short horizons and false counts. Python checks confirm final labels cannot choose candidates and zero-demand development cannot yield a high-accuracy claim. Browser flows were not rerun because only translated error strings changed on the frontend; the earlier seven planning/browser checks remain historical evidence. No hosted deployment or data import was performed.
