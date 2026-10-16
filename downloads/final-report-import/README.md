# Final sales report: actual quantity extract

`PartCast_Final_Report_Actual_Only.xlsx` contains only the 27 rows from **Actual Qty Evidence** in the supplied `Final_Sales_Report_2016-2026.xlsx`. Dates, part numbers and quantities are unchanged. The rows cover 13 identified parts and total 598 units.

These are the same 27 quantity observations in the supplied database snapshot. **This report adds no new verified quantity observations.** The report also contains estimated amounts, proposed date corrections and four suggested quantities of 1. Those assumptions are excluded from this extract.

## Import only if you need to restore these 27 rows

If your current rebuilt database already has these 27 imported history rows, no import is needed.

1. Open PartCast's spreadsheet import page.
2. Choose **Sales quantities for forecasting**.
3. Select `PartCast_Final_Report_Actual_Only.xlsx`.
4. Check that the result shows 27 imported rows and no skipped rows.

This import **replaces existing imported forecasting history**; it preserves sales recorded through PartCast and does not change stock. If you have since imported more verified history, merge that complete history first. Do not use this extract on the old database where four of these observations already exist as sales recorded through PartCast: that would double-count those sales.

## What is still needed for forecasting

As of 17 October 2026, none of these 13 parts meets every current training check. Two parts have enough historical sale days but no recent sale; the other parts have too few observed sale days. A valid import does not establish forecast accuracy, and no new WAPE score can be claimed from these unchanged records.

Use [02_Complete_Missing_Sales.xlsx](../sales-repair/02_Complete_Missing_Sales.xlsx) to complete missing **actual sale dates, exact existing part numbers and quantities sold**, using receipts or the owner's sales log. Its pending rows start blank. Keep all verified imported history and exclude sales already recorded through PartCast. Invoice references and invoice amounts do not supply quantities. Days with missing records are not confirmed zero-sale days.

The full report is a financial and planning document; do not import it as stock or forecasting history. The accompanying `InvoiceRegisterCSV` mentioned in its notes was not supplied.

## Verification

The extract was tested using the real PartCast importer and an isolated PostgreSQL database with the supplied 1,506-product inventory. All 27 observations were preserved, repeated imports retained 27 rows, and stock did not change. The original financial report was rejected before database writes. No live database was changed.
