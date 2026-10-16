# Actual sales files ready for PartCast import

- [Download the Excel workbook](PartCast_Actual_Sales_Import_Ready.xlsx)
- [Download the matching CSV](PartCast_Actual_Sales_Import_Ready.csv)

On GitHub, use **Download raw file** if the file opens in a preview. These files have no password and can be uploaded directly to PartCast. The user previously authorized Excel delivery on this branch; these downloads contain only the selected historical part numbers, dates, quantities and source labels. They do not include staff/customer accounts, contacts, access keys or database UUIDs.

## Import

1. Open **Import spreadsheets** in PartCast.
2. Choose **Sales quantities for forecasting**.
3. Select either the Excel workbook or CSV, and import **one** file.
4. With the supplied inventory snapshot, expect **23 rows imported and 0 skipped**.

The workbook's import sheet is `Daily_B_Usable`; `READ_FIRST` explains the data and limitations. A successful forecasting import replaces earlier imported training history. It preserves sales recorded through PartCast and does not change stock counts. Include the complete verified imported history you want to retain whenever replacing this file later.

## Contents and limits

Prepared on **16 October 2026** from `OWNER_ACTUAL_DATA` in the supplied owner-labelled workbook. Its 23 actual rows match `VERIFIED_HISTORY` and the 23 rows from the prior reviewed source extraction that match the current inventory. All original dates, identifiers and quantities are preserved: nine parts, dated **15 January 2018 through 17 May 2024**. The other 751 reviewed historical rows do not match the supplied current catalog and are excluded pending source-backed reconciliation. None of the 6,570 modeled daily rows, cached forecast results or future predictions are included.

The supplied database export already contains these same 23 imported observations plus four PartCast sale records. The four recorded sales are excluded from these import files to avoid duplicating them. Reimporting therefore restores/retains the same 27 total demand observations for that snapshot; it does not create additional sale days.

**Import compatibility is verified; current forecasting readiness remains insufficient.** No part in the supplied combined snapshot meets all current XGBoost history requirements. Recent, complete actual sales for the same identified parts and a working Python runtime are still required. This file does not establish or improve a measured accuracy score. Missing product unit labels and identifiers were not guessed.

## Verification

The actual PartCast spreadsheet loader and importer were executed against a stubbed database initialized from the supplied CSV exports, for Excel and CSV in both automatic and explicit forecasting-import modes. All four cases imported 23 observations with zero skipped rows, preserved the four recorded sales byte-for-byte, preserved all stock values and retained the exact imported date/product/quantity tuples. No live database import was performed.
