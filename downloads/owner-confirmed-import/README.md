# Owner-confirmed sales imports

Prepared from `Final_Actual_Sales_Report_2016-2026.xlsx`, supplied on 17 October 2026 with the user's statement that the owner confirmed the sales. Confirmation is attributed to the owner through the user and source workbook; this is not an independent receipt audit. Original recorded values and confirmation bases remain visible in file 03.

## Import these prepared files

| File | Contents | PartCast action |
| --- | --- | --- |
| `01_Owner_Confirmed_Sales_Import.xlsx` | 5,747 invoices totalling **PHP 33,127,883.30** | Import as past sales/invoices. Keep transaction-count proxies off. |
| `02_Owner_Confirmed_Demand_Import.xlsx` | 34 quantity observations for 20 existing parts, totalling 607 units | Import as **Sales quantities for forecasting**. |
| `03_Confirmation_Audit_Only.xlsx` | The 81 reviewed invoice additions, four quantity confirmations and full 434-row review register | Open for traceability; do not import. |
| `04_Complete_Recent_Sales.xlsx` | All 34 quantity observations retained, plus 32 blank receipt placeholders | Fill only missing actual lines from receipts or the owner's log; then import the completed file as **Sales quantities for forecasting**. |

Use these prepared files rather than the original multi-sheet report. The original report places its 27 old quantity rows and four newly confirmed quantities on separate sheets. The prepared quantity file also retains the three documented part-code reconciliations from the previous import pack, producing 34 rows in total.

Keep your existing inventory and accounts; no database reset or inventory import is needed. These files add no products and do not change current stock.

## What changed

The invoice file preserves the previous 5,666 clean invoices and adds:

- **73** reviewed invoices with original recorded amounts and owner-confirmed reporting dates.
- **8** invoices whose amounts were originally blank, with the separately reported owner-confirmed amounts now supplied. The original blanks and original estimation basis are preserved in the audit notes.

The total is 5,747 invoices. The 254 cancelled and 99 unresolved source records remain excluded. Thirty of the added invoice records have no original item description; those descriptions stay blank rather than being invented. Invoice amounts are used for financial reporting, not converted into sold quantities.

The quantity file preserves all 30 observations in the prior import pack and adds these four newly owner-confirmed records:

| Receipt | Sale date | Existing part code | Owner-confirmed quantity |
| --- | --- | --- | ---: |
| SI#7546 | 2026-07-24 | 04465-YZZ57 | 1 |
| SI#7549 | 2026-07-24 | 17801-0Y040 | 1 |
| SI#7569 | 2026-08-08 | 13540-67020 | 1 |
| SI#7569 | 2026-08-08 | 90311-32020 | 1 |

These four rows retain the `owner_confirmed_actual_quantity` tier and confirmation source. Their quantities were initially proposed and are now explicitly owner-confirmed according to the newly supplied workbook and user statement. They are not presented as quantities independently read from the original receipts. The date and quantity values were not changed during preparation.

The separate 6,570-row XGBoost demonstration remains simulated. This source report confirms the four quantities listed above and the invoice figures; it does not supply a receipt-backed daily series for the demonstration workbook.

## Duplicate and replacement checks

The invoice importer skips matching existing references. In testing, importing this file after the old 5,666-row invoice file added 81 invoices and skipped 5,666. A repacked repeat added none. If a reference already exists with different details, the importer preserves it and reports a conflict; review those warnings instead of assuming it was corrected.

The quantity importer **replaces all imported forecasting history**. Merge any newer imported history first. Sales entered through PartCast remain separate and must not be copied into imported history. This file includes four older PartCast observations preserved after the database rebuild; on an older database that still stores those four as counter sales, remove their duplicate import rows first.

After filling file 04, import that completed version. Importing the unchanged file 02 afterward would discard additional imported history entered into file 04. In the placeholders, receipts SI#7546, SI#7549 and SI#7569 already have the four confirmed items above; enter only additional verified, unrecorded lines.

## Current forecasting readiness

The Python check on 17 October 2026 finds **34 observations, 20 parts and 0 current eligible parts**. Latest recorded sale remains 12 October 2026. The four additions are from July and August, and each new part has one observed sale day. The two parts with enough older sale days still lack recent history.

Current training requires at least five distinct sale days across 35 calendar days for the same part, a usable sale within 31 days, and enough training/test feature rows. Owner confirmation establishes the reported source of the figures; it does not add further sale days or establish forecast accuracy. No actual-store WAPE score is claimed.

## Verification

Both imports were run through the real PartCast importer in an isolated PostgreSQL database containing the supplied 1,506 products. All 5,747 invoice tuples and all 34 date/part/quantity tuples match the prepared source data. The sum of invoice amounts matches the owner's combined report total. The completion form retains all 34 observations and ignores 32 blank placeholders. The audit workbook is rejected before writes. Stock is unchanged, no products were created, and no live database was modified.
