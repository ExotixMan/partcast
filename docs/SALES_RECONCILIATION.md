# Verified-sales reconciliation — 15 October 2026

**One previously excluded actual sale was recovered from the existing workbooks.** It adds four recorded units for an already identified part. No sale dates or quantities were invented, no new part identifiers were added, and no existing accepted daily rows were changed or removed.

The inventory source row has a blank primary part number. Its `Sub#` contains an exact existing catalog SKU, and that same SKU is written on the uniquely linked sales invoice. The sale date and quantity come from the existing source rows. This is independently corroborated identifier recovery, rather than filling a blank cell from its neighboring row. The raw uploads remain unchanged.

## Rules implemented

- Recover an ID only from an exact existing inventory primary SKU written in the source row's `Sub#` and on the linked invoice. Unknown IDs, longer variants and slash variants are not accepted as matches.
- Require one matching invoice with a valid date and positive recorded amount, a positive recorded quantity, and no mixed STOCK/SI# allocation.
- Continue all existing date, quantity-conflict, duplicate and quantity-semantics checks. Recovering an identifier does not bypass them.
- Preserve the original blank primary ID, original Sub#, recovery method and both invoice/inventory source row numbers in `Quantity_Provenance`.
- Keep the corrected files and detailed ledger private outside source control. No Supabase import or inventory-count update is performed.

## Results

| Measure | Before | After |
| --- | ---: | ---: |
| Accepted sales quantity lines | 759 | 760 |
| Daily part observations | 757 | 758 |
| Identified parts with quantities | 709 | 709 |
| Parts meeting minimum historical requirements | 2 | 2 |
| Fresh eligible parts | 0 | 0 |
| Same-period 30-day WAPE | 100.3285% | 100.3285% |
| Same-period MAE, units per part-period | 13.3771 | 13.3771 |
| Same-period RMSE | 23.0941 | 23.0941 |

The re-test uses the same three historical part-periods of one part, with one positive period and 40 total recorded units. The added sale does not alter the histories used in those particular tests. Its recovery improves source coverage; it does not establish lower forecast error. Current-date prediction remains blocked by stale eligible histories.

The original accepted CSV hash was `94d9d4a5613f91bda4990abbc802ff96eebad07ce18eac48df67633bab90ab5e`. The corrected CSV hash is `60e12e9a93345ad1eb181c1cc83696815e76823c4d77ec161afcfa58ad185d84`. All original accepted rows are preserved exactly; the only added daily row is the verified four-unit sale. Original workbook hashes remain those recorded in [the prior model review](MODEL_IMPROVEMENT_REVIEW.md).

The 66 mixed stock/sale rows remain excluded while their allocation semantics await clarification. Missing IDs without exact corroboration, possible duplicates and uncertain dates still need receipts or the owner's sales log. The older uploaded training workbook labels some quantities as inferred/proxy; its generated values cannot independently verify new actual sales. The older cleaned sales workbook includes dates reconstructed from adjacent rows, which cannot corroborate a real sale date by themselves.

## Files and verification

Private outputs are under `/workspace/partcast-sales-reconciliation-20261015/verified/`: updated training, cleaned sales and cleaned inventory workbooks; quantity provenance; a correction ledger; review issues; historical audit and same-period comparison. The `baseline/` folder preserves the pre-correction extraction. Detailed source records are not committed to Git.

Reproduce the corrected extraction using the existing command in [forecasting data preparation](FORECASTING_DATA.md), the original source workbooks, `--as-of 2026-10-15`, and `--linked-quantity-is-sold`. Use the real review date for later runs. Run the historical audit against its `actual-demand-daily.csv` without modifying sales or importing into Supabase.

**37 Python tests passed.** The bounded application XLSX parser also read the generated workbook and verified exactly one recovered sale, quantity four, and all 758 training rows. Tests reject unknown or partial-match IDs, unrelated invoices and ambiguous/conflicting dates/quantities. A data-diff assertion verified that no previous accepted daily row changed or disappeared. No model, frontend or database schema was changed in this reconciliation.
