# Import files for a NEW empty PartCast database

Prepared on 16 October 2026 from the supplied full_backup.sql. These files contain existing inventory and recorded demand only. No items, dates or quantities were invented; no generated daily demand or forecast results were included. They contain no account records, customer contacts, database UUIDs or credentials.

- [Download inventory Excel](01_Inventory_Import.xlsx)
- [Download actual sales-history Excel](02_Actual_Sales_History_Import.xlsx)
- [Download both files in one ZIP](PartCast_Fresh_Start_Import_Files.zip)

## Import in this order

1. Finish the new-project SQL setup, create your Super Admin and sign in.
2. Open **Import spreadsheets**. Choose **Inventory and purchases**, then import **01_Inventory_Import.xlsx**. Expected result: **1,506 rows imported, 0 skipped**. This is the backup's current-stock snapshot, with a total recorded quantity of **3,251** across rows. It includes existing part numbers, descriptions, brands, sub-numbers, units, locations, purchase costs and selling prices. Confirm these quantities still match your shelves before starting new sales.
3. Choose **Sales quantities for forecasting**, then import **02_Actual_Sales_History_Import.xlsx**. Expected result: **27 rows imported, 0 skipped**, covering **13 identified parts** and a total demand quantity of **598**. This includes the backup's 23 imported historical observations and 4 recorded PartCast sales. Their original dates, quantities and identified parts are unchanged. Importing these as forecasting history does not sell the items again or subtract stock.
4. Check Inventory and the import results. Imported demand history should contain **27** observations; current stock should remain **3,251** in total unless you have recorded new movements. Then open Demand planning and check the sales-history status.

Import one file at a time. Do not upload the ZIP itself: extract its two Excel files first. Do not import the older 23-row sales file afterward; a training import replaces earlier imported training history.

## Fresh database only

These two files are intended for the NEW database before recording any sales. Inventory import overwrites current stock with spreadsheet quantities. The 27-row history includes 4 sales formerly recorded in the old database: importing it into that OLD database would duplicate those four demand observations because the existing actual-sale records are preserved by the importer. Keep using the older 23-row import if deliberately maintaining the old database.

The inventory retains the 34 existing items with no part number using their original descriptions. Missing identifiers and units remain blank. Do not invent part numbers merely to clear a warning. The old snapshot has all items in category `parts`, zero minimum/safety stock thresholds and no barcodes or search aliases; the new database defaults match these values. Review real low-stock thresholds after import.

## This is inventory and forecasting history, not a full database restore

These files do NOT reconstruct the old 5,848 legacy invoice rows, 235 purchase-history rows, 20 supplier records and supplier links, customer utang/payment records, stock-movement ledger, staff accounts, settings, photos or forecast models. The four former PartCast sale observations become imported forecasting history; their financial transactions are not recreated. Keep the old project/private backup and reconcile these other records separately before fully switching the store. The backup's stored photo metadata cannot reproduce actual image files: download photos from old Storage and upload them again.

## Forecasting limitation

A successful import does not establish forecast accuracy. The existing observations are sparse and mostly old (15 January 2018 through 12 October 2026 overall). In the inspected snapshot no part currently meets all XGBoost training-readiness requirements. These files preserve actual data; they do not lower WAPE by altering sales. Add recent, complete, actual part-level sales and evaluate predictions against later actual sales.

## Download

Use the GitHub **Download raw file** button if a file opens in a preview. No Excel password is required. The ZIP contains these instructions and the two workbooks.

## Verification

The real PartCast import functions were run against a separate PostgreSQL database through PGlite with the complete application schema. The delivered Excel files imported 1,506 inventory rows and 27 demand rows with zero skips. Original stock, costs, prices, identifiers, descriptions, units and locations matched the source backup. All 27 original part/date/quantity tuples matched. Importing history made no stock or ledger changes; repeating the history import retained 27 observations, and repeating the identical inventory upload was refused. No live database was changed. Hosted import speed and the current Render/Supabase connection still depend on your deployment.
