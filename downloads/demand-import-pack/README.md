# PartCast actual-data imports and labelled forecasting demo

This pack contains actual-data imports and a separate, explicitly simulated XGBoost demonstration. **To run predictions now, use file 05 in Forecasting demo.** The actual-data files preserve the supplied records and keep financial reporting separate from sold quantities for each part. **The actual data is still insufficient for current demand forecasting.** No actual sale dates, quantities, zero-sale days, products or accuracy scores were invented.

## Run the labelled XGBoost demo

1. Open **Demand planning** in PartCast.
2. Expand **Forecasting demo · simulated data**.
3. Choose `05_SIMULATED_XGBoost_Demo.xlsx`.
4. Click **Test XGBoost demo** and wait for the result.

This workbook belongs in that demo panel, **not the normal Imports page**. Normal store imports intentionally reject it. The main store-history readiness panel may still show no eligible parts because it checks actual history separately.

The demo contains **6,570 simulated daily rows for nine existing part codes**: 5,490 training rows, 540 validation rows and 540 test rows. All dates and quantities were copied unchanged from the supplied, already simulated `PartCast_Capstone_Forecasting_Improved.xlsx`. Actual-history and old score sheets were left out; the real forecasting service recalculated the models and results. Every row retains its synthetic label.

The selected direct-period XGBoost method achieved **17.5016% WAPE** over 18 simulated test part-periods. The recent 28-day average scored 21.1573%; the 365-day average scored **12.3028%**, better than XGBoost. Model choice uses validation results before testing. This reused simulated dataset and its inspected results are a demonstration, not fresh independent evidence of real-store accuracy. WAPE is quantity error, not a percentage of correct forecasts.

`06_SIMULATED_Test_Results.xlsx` and `SIMULATED_XGBoost_Results.json` contain the recalculated results and nine future demonstration estimates. The estimates are relative to simulated history ending 14 October 2026. The demo does not change actual sales, stock, imported store history, restock recommendations or supplier emails.

## Files

| File | Contents | How to use it |
| --- | --- | --- |
| `01_Past_Sales_Import.xlsx` | 5,666 clean invoice records with original references, dates and amounts | Import as past sales/invoices. Keep transaction-count proxies off. These are financial records, not confirmed quantities for each part. |
| `02_Actual_Demand_Import.xlsx` | 30 recorded quantity observations, 16 existing parts, 603 units | Import as **Sales quantities for forecasting**, only when intentionally replacing imported history. |
| `03_Complete_Recent_Sales.xlsx` | The same 30 observations plus 32 receipt placeholders with blank date/part/quantity cells | Fill the yellow cells from actual receipts or the owner's sales log, add rows for multi-part invoices, then import the completed version as **Sales quantities for forecasting**. |
| `04_Part_Mapping_Review.xlsx` | 748 historical quantity observations whose source part codes are absent from the supplied current inventory | Review only. It deliberately has no import table. Do not import it as stock or quantities. |
| `05_SIMULATED_XGBoost_Demo.xlsx` | 6,570 generated daily rows, with separate training, validation and test sheets, for nine existing parts | Upload only in **Demand planning → Forecasting demo · simulated data**. |
| `06_SIMULATED_Test_Results.xlsx` | Recalculated simulation metrics, comparisons and future demonstration estimates | Open to view results; do not import. |

Keep the current inventory. This pack does not require a database reset or another inventory import.

## Before importing quantities

The quantity importer **replaces all existing imported forecasting history**. It preserves sales entered through PartCast. If you have added more imported history since the supplied 27-record snapshot, merge that complete history first.

The 30-row file preserves the old 27 observations, including four sales from the supplied pre-reset PartCast backup. Use it with the rebuilt database where those four now appear as imported history. If an older database still contains those four as counter sales, remove the duplicate four from this import first. Do not copy newly recorded counter sales into imported history.

After completing file 03, import that completed version. Importing unchanged file 02 afterward would replace your added imported history with the original 30 rows again.

## Why there are 30 quantity observations

The original sales source has 6,100 invoice references: 5,666 clean records and 434 requiring review. An invoice amount is not a sold-unit count.

Rechecking the original inventory-linked sales found **774 historical daily quantity observations**. Of these, 23 match current inventory codes exactly. Three additional observations can be linked through documented hyphen-only part-code differences:

| Recorded code | Existing inventory code | Sale date | Recorded units |
| --- | --- | --- | --- |
| `PRD47096` | `PRD-47096` | 2019-01-08 | 2 |
| `PRD47152` | `PRD-47152` | 2020-06-30 | 2 |
| `PRD47127` | `PRD-47127` | 2022-03-17 | 1 |

The numerical PRD codes agree, the recorded descriptions identify rotor/brake discs, and the original purchase records corroborate the Power Plus brand. The original codes, receipt references and source row numbers remain in the provenance sheet. Dates and quantities are unchanged.

Those 26 matched historical observations plus the four existing recent observations produce **30 rows for 16 parts**. The other **748 source observations remain available in the review workbook**. No unidentified item or unknown current stock amount was added to inventory.

## Prediction readiness

As of 17 October 2026, **0 parts meet all current training checks**. The three recovered observations are historical and do not fix missing recent sales. Only two parts have the minimum historical sale days and span; their latest sales are old. The recently sold parts have too few observed sale days.

The engine needs at least five distinct sale days spanning 35 calendar days for the same part, a usable sale within 31 days, and enough remaining training and test rows after feature creation. These are minimum checks, not proof of accuracy. Complete recent history over several months is preferable. Days without records remain unknown, not confirmed zero demand.

Use file 03 to enter verified missing sales. Leave unknown counts blank, use the exact existing part code, and retain all verified imported history. Do not enter a default quantity of 1 or change historical dates to make training pass. Resolving the 748 unmatched codes alone does not guarantee enough recent history.

No current actual-store WAPE score can be claimed from this pack. The separate labelled simulation stays in Forecasting demo and cannot establish real-store prediction accuracy.

## Verification

The files were checked with the real PartCast importer in an isolated PostgreSQL database containing the supplied 1,506 products. The invoice import preserves 5,666 records and skips a repeated copy. The quantity files preserve the same 30 tuples; blank receipt placeholders are ignored. Stock is unchanged, no products are added, and the review file is rejected before writes. The Python readiness check reports 30 observations for 16 parts and 0 current trainable parts. The demo ran through the actual forecasting service and produced nine 30-day estimates; all four normal import choices reject that workbook before any store database calls. No live database was changed.
