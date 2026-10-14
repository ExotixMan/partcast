# Sparse-demand forecasting correction — 14 October 2026

The recursive forecasting logic was corrected, but **the measured quantity error did not improve**. On the same three historical 30-day part-periods, WAPE rose from **100.0345% to 100.3285%**. This is a software correctness change, not evidence of higher predictive accuracy. No sales dates, quantities or part identifiers were edited.

## Corrected behavior

Previously, a positive predicted quantity became a positive sale event in the following day's event features. For example, predicting 0.5 units made the next input behave as though a sale had occurred: the time since demand reset and the event count increased. A mean quantity estimate does not confirm an event.

Quantity lags and rolling quantity statistics still use recursive estimates. Sale-event counts and the time since the last observed sale now use a separate history of observed events. Predicted quantities do not create observed events. Unknown future events are represented by no *observed* event; this does not establish zero future demand, and event features become uncertain beyond the forecast origin. This remains a deterministic approximation, rather than a probabilistic simulation of future events. Training features at an observed origin retain their existing meaning.

New runs use the `xgb-observed-events-` version prefix and describe this behavior in `metrics.recursive_event_handling`. Existing stored runs are not rewritten. Review a new run after deploying the API and supplying eligible recent records; an old run cannot change just because source code was updated.

## Unchanged-data measurement

The previous implementation was loaded from commit `b21867266d7b0e39c1e0cded1520869e697a429a`. Both versions trained separately before each identical period and predicted the full 30 days without using that period's labels. The periods span 8 December 2022–7 March 2023, cover **one part**, and include **one period with recorded demand**. Recorded quantities total **40 units**. These records had already been reviewed, so the comparison is historical diagnostic evidence, not a fresh independent test.

| Method | MAE, units per part-period | RMSE | WAPE | Total predicted units |
| --- | ---: | ---: | ---: | ---: |
| Previous recursive XGBoost | 13.3379 | 23.0940 | 100.0345% | 0.0138 |
| Corrected recursive XGBoost | 13.3771 | 23.0941 | 100.3285% | 0.1314 |
| Recent 28-day average | 13.3333 | 23.0940 | 100.0000% | 0.0000 |
| Croston-SBA reference | 13.7613 | 22.3773 | 103.2100% | 3.8520 |
| TSB reference | 17.3833 | 21.1797 | 130.3750% | 23.2980 |

The intermittent methods now participate in the application's same-origin horizon comparisons. They reuse the existing exploratory benchmark's formulas and defaults: Croston-SBA alpha 0.1, TSB size alpha 0.1 and probability alpha 0.01. Croston retains its single-event exposure fallback. They update from supplied historical days only; future estimates cannot become sales or observed inactivity. They are reference methods, not automatic production replacements. A smaller RMSE for one reference does not mean it lowered WAPE or established reliable forecasting.

The separate development-only comparison now includes all five candidates. Development ends 5 February 2023 and has **zero periods with recorded demand**. Consequently, its WAPE is undefined, no candidate is selected, and the final-period candidate ranking is skipped. The comparison's `production_model_changed: false` means the comparison tool does not install a replacement; it does not undo the independently implemented event-feature correction described above.

## Integrity and limitations

The accepted CSV remains **757 observations across 709 identified parts**, with no new identifiers. Its SHA-256 is unchanged: `94d9d4a5613f91bda4990abbc802ff96eebad07ce18eac48df67633bab90ab5e`. Both original uploaded workbook hashes remain unchanged as listed in [the earlier model review](MODEL_IMPROVEMENT_REVIEW.md). Detailed data and comparison JSON stay private outside Git.

Missing internal days still use the existing, unverified zero-coverage assumption. Stockouts and missed sales were not supplied. Only two parts meet the minimum history requirement, and neither has current eligible history. The stale-data guard remains active. Neither these tests nor synthetic software fixtures establish current-store accuracy or readiness for automated purchasing.

For a defensible improvement, collect complete recent actual quantities for the existing parts, reconcile documented mistakes against receipts, verify units and recording coverage, and reserve a genuinely new test period. A stock snapshot cannot supply missing sales. See [forecasting data preparation](FORECASTING_DATA.md).

## Reproduce and verify

Run the historical audit from the repository root using the fixed implementation:

```bash
.venv/bin/python ml/evaluate_forecast.py \
  --csv /path/to/actual-demand-daily.csv \
  --output /tmp/prediction-audit.json \
  --as-of YYYY-MM-DD

.venv/bin/python ml/compare_forecast_candidates.py \
  --csv /path/to/actual-demand-daily.csv \
  --output /tmp/candidate-comparison.json --horizon 30

.venv/bin/python -m unittest discover -s ml -p 'test_*.py'
```

Use the real review date. Audits run from older commits retain their older forecasting behavior; earlier reports are historical snapshots. For the previous recursive result, run the audit at the exact previous commit above in a separately prepared checkout, preserving user work.

Verification: **34 Python tests and 3 affected Node forecasting tests passed**. Tests include real Node-to-Python XGBoost execution and model serialization, copied Windows-path fallback, input/output validation, observed-origin feature alignment, unchanged observations, future estimates not resetting the observed-event clock, intermittent estimator calculations, and candidate selection that cannot inspect final-period labels. Node integration data is synthetic software-test input, not store accuracy evidence. No frontend code, SQL migration, hosted import, actual email or live deployment is included in this change.
