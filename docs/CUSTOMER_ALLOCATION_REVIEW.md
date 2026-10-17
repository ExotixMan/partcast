# Customer/stock allocation review — 15 October 2026

Sixteen previously excluded sales lines, totaling 30 units, were recovered from explicit customer/stock counts in the original inventory notes. The customer-designated count is used as sold only when the two written counts equal the original row total. Original uploads and all 760 previously accepted sales lines remain unchanged.

This is an opt-in extension to [raw-data preparation](FORECASTING_DATA.md). It accepts only a narrow set of documented note formats, requires a unique valid sales invoice and an identified primary part number, and retains date, quantity-conflict and duplicate checks. Returns/replacements, missing allocations, unclear units, numeric customer-name prefixes and unsupported formats remain in review. Quantities are never calculated from invoice prices or from subtracting an assumed stock count. Original total, sold count, stock count, invoice and inventory row references are preserved.

Historical part identifiers remain exact, including spaces and slash variants. Fourteen source-identified parts now appear in the accepted sales extract for the first time; these are existing source records, not invented inventory items. Only one of the sixteen recovered lines exactly matches a current inventory identifier. The training importer skips unmatched identifiers; no guessed catalog mapping or inventory update was performed.

| Measure | Before this allocation review | After |
| --- | ---: | ---: |
| Accepted sales lines | 760 | 776 |
| Daily part observations | 758 | 774 |
| Identified parts with quantities | 709 | 723 |
| Parts meeting historical minimum | 2 | 2 |
| Fresh eligible parts | 0 | 0 |
| Same-period 30-day WAPE | 100.3285% | 100.3285% |
| Same-period MAE | 13.3771 | 13.3771 |
| Same-period RMSE | 23.0941 | 23.0941 |

The identical three 30-day periods of one part were re-evaluated without changing model parameters or supplying their sales to training. Only one period contains recorded demand: 40 units versus zero predicted. The other two periods contain no recorded units and approximately 0.1314 predicted units combined. The accepted additions do not change the histories used in those tests. WAPE measures quantity error, and this small historical diagnostic does not measure current whole-store accuracy. Internal missing days remain unverified zeros for this comparison.

Forty-nine mixed-note rows remain unresolved, and one additional explicit split still lacks a primary part identifier. No eligible history is current enough for production forecasting. Complete recent sales, verified identifiers/base units and an independent holdout are still required before claiming reliable forecasting for deployment or defense. No live database import, production-model replacement or deployment was performed.

## Reproduction and verification

Use the command in [forecasting data preparation](FORECASTING_DATA.md) with the two original workbooks, `--as-of 2026-10-15`, `--linked-quantity-is-sold` and `--customer-allocation-is-sold`. Use the actual review date for later reviews. Outputs remain private under `/workspace/partcast-customer-allocation-review-20261015/`, including the three workbooks, row provenance, recovered-allocation ledger, source hashes and same-period forecast audit. The earlier baseline/reconciliation directories remain intact.

The actual-demand CSV SHA-256 is `b51bba6a0e41e5a7caa381360be09bbc70a336024c8e61e5bc927676fefb4272`. Without the new flag, extraction still reproduces the previous 758 daily observations exactly. All prior accepted rows and quantities are preserved with the flag enabled; the sixteen added rows account for the full change. Source workbook hashes match the earlier reviews.

The Python suite passes **47 tests**. New cases cover both note orders, attached count/word formats, explicit-count sum validation, confirmation requirements, price/unit distinctions, replacement exclusion, exact historical identifiers, conflicting invoice quantities and duplicate quarantine. The generated workbook is also validated through the application's bounded XLSX parser. These checks establish extraction correctness, not improved forecasting accuracy.

The [protected training workbook](../downloads/protected/PartCast_Actual_Quantity_Training_Protected.xlsx) contains `Daily_B_Usable`, full quantity provenance and `Recovered_Allocations`. It uses Office password encryption. Open it in Excel with the password supplied separately, review the recovered rows, and save a separate copy without the password before attempting a PartCast import. Imports replace prior imported training and may overlap with actual PartCast sales; review dates and identifiers first. This historical extract still cannot produce reliable current forecasts.
