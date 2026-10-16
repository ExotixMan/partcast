# Cleaned sales workbook and missing-quantity worksheet

Prepared on 16 October 2026 from the uploaded `CUST-REF-TRANS.xlsx`. Its SHA-256 is `37a9f9758389be60cb49e96fdea654b42995cb0adb7d0d30f7f8be958cdfa685`; it is identical to the earlier sales workbook. The original file was not changed.

Download [all files in one ZIP](PartCast_Sales_Repair_Files.zip), or download each workbook below. Extract the ZIP before uploading an Excel file to PartCast.

## 1. Invoice history ready to import

[01_Past_Sales_Import.xlsx](01_Past_Sales_Import.xlsx) contains **5,666 invoice records** with usable dates, positive amounts and item descriptions. Cancelled records, missing dates/amounts/descriptions, future/invalid dates, identified possible day/month swaps and the isolated 2004 date are set aside for review. Original source invoice references, usable dates and amounts are preserved. Customer names are omitted from this delivery copy, and a phone-like contact string is removed from one description; keep the original workbook privately for customer details.

First deploy the latest API from branch `codex/partcast-offline-forecasting-20261009`. This release imports invoices in batches instead of thousands of individual database requests. It skips existing invoice references: matching details are treated as duplicates; conflicting details are left unchanged and reported for review. Retrying an interrupted import skips invoice records already saved. Do not run overlapping imports; these client-side reference checks are not a database uniqueness constraint.

New invoice-to-product links require one complete identified code. Partial code matches, alphabetic vehicle/model labels and invoices containing several known part codes remain unassigned instead of linking the whole invoice to an arbitrary part. The original description stays available for review.

In **PartCast → Import spreadsheets**, choose **Past sales and customer records** and upload this workbook. Leave **Estimate one sold unit when a quantity is missing** switched **off**. With an empty invoice ledger, expect **5,666 imported and 0 skipped**. If the invoices already exist, expect skips and review the result warnings. This file populates invoice reporting only. It does not replay sales, deduct stock, create customer utang or create actual sold quantities for forecasting. Existing records are not overwritten to apply corrections automatically.

## 2. Complete verified missing sales for forecasting

[02_Complete_Missing_Sales.xlsx](02_Complete_Missing_Sales.xlsx) preserves the **27 observations** already imported after the fresh setup. It also lists **32 recent-date invoice entries** from the source workbook, with yellow cells for you to complete from receipts or an authoritative sales log. Their recorded dates/descriptions are references, not confirmation of quantities.

On `Daily_B_Usable`, fill yellow columns **A–C** only when verified:

| Column | Enter |
| --- | --- |
| Date | Actual sale date confirmed from the receipt |
| Part Number | Exact part from the `Part_Lookup` sheet; a vehicle model alone does not identify a part |
| Demand Quantity | Actual quantity sold in that part's stock unit |

For an invoice with several parts, duplicate its pending row and fill one row per part. Match the sold unit to Inventory's unit: a 2-litre bottle is not automatically two bottles, and the number of pieces inside a set is not automatically the number of sets sold. Keep all 27 existing observations and add only sales missing from PartCast. Do not duplicate transactions already recorded through **Sell or receive**. If imported history has grown beyond this 27-row snapshot, merge that complete imported history before replacing it.

Confirm the dates and per-part quantities for **SI#7289, SI#7290 and SI#7493** against receipts, particularly the day/month ordering. Other questionable dates are listed in the review workbook. No suspected date was silently swapped.

After completing verified rows, upload this workbook using **Sales quantities for forecasting**. Pending rows with A–C empty are ignored. A successful training import replaces earlier imported training history, while sales recorded through PartCast are retained. Uploading this template unchanged imports the same 27 observations; it adds **zero** new usable sale days. Do not use this fresh-setup template on the older database where four of those observations still exist as original PartCast sale transactions.

## 3. Review workbook

[03_Review_Only.xlsx](03_Review_Only.xlsx) contains **434 invoice records** needing review, the 32 recent-date entries and descriptions with written count/volume patterns. These are not all verified sold counts. Review categories overlap. The 5,666 import records plus 434 review records retain all **6,100 source invoice references**.

Use this workbook to check receipts; **do not upload it to PartCast**. Its column headings deliberately do not form an import table. Correct missing or ambiguous information from documents, then transfer only verified missing part-level sales into the forecasting worksheet.

## What this fixes and what is still missing

The uploaded workbook adds **no newly verified, inventory-matched demand observations** beyond previously supplied history. The explicit count lines that can already be matched safely are in that earlier history. Most invoices supply totals and descriptions without per-part counts; volumes, package sizes, model years and invoice totals are not treated as sold quantities. Missing quantities and dates stay unknown.

The 27-record snapshot still fails the current XGBoost history checks. Cleaning invoice formatting does not make its demand current or reduce measured WAPE. More complete, recent, actual part-level dates and quantities are required; future evaluation must compare forecasts with later actual sales.

The files contain no Auth accounts, password hashes, tokens or database UUIDs. Customer-name columns are excluded. Preserve the original workbook privately.

## Verification

The actual PartCast parser and import functions were tested against isolated PostgreSQL/PGlite with the complete application schema. The delivered invoice file imported 5,666 rows with zero skips, kept original references/dates/amounts, changed no stock or demand observations and created no count proxies. A re-saved copy of the same invoices inserted zero additional records. The unchanged completion worksheet retained all 27 original part/date/quantity tuples and ignored all 32 pending rows. The review workbook could not be recognized as an automatic import. Fixture tests also cover batching, conflicting references and resuming after an interrupted batch. No live database import or source-file alteration was performed.
