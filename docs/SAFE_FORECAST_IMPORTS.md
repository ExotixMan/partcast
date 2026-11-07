# Safe forecasting-history imports

This change applies to **Sales quantities for forecasting**, including automatic
detection of that file type. Inventory and historical-invoice imports keep their
existing workflows; this change does not make those imports transactional.

The browser first uploads the file for a read-only review. The server validates
every nonblank data row, matches an unambiguous active part, and returns the
number of daily quantities and the number of imported rows being replaced.
The user confirms that complete replacement before saving. A selection containing
a forecasting-history file must contain only that one file.
The review uses a separate `/api/imports/spreadsheet/preview` endpoint. An older
API cannot mistake that review for its original write endpoint. An unsupported
or malformed preview response stops the browser before any commit request.

Invalid or future dates, unknown/ambiguous part codes, negative/invalid quantities,
more than two decimal places, numeric overflow and an empty positive-sales history
reject the replacement. Dates must be Excel dates/serials or `YYYY-MM-DD`, without
ambiguous day/month guessing. Valid zero-sale days are reported separately and
are not stored as positive sold quantities. Distinct sales for the same part/date
are combined using integer cents, avoiding silent rounding. The limit is 50,000
combined daily quantities and the existing spreadsheet size/row limits still apply.

The review token is signed and bound to the staff account, file contents,
matched quantities, expiry and the current imported-history fingerprint.
The database rechecks the active manager, products, quantities and fingerprint.
A changed history or expired review requires another review. Actual sales may
continue between review and commit; they are not part of the replaced source.

The replacement runs in one PostgreSQL transaction, including deletion of the
previous `imported_training_data`, insertion of the replacement, completion of its
import receipt and the forecast-refresh request. Any database error rolls all of
those changes back. Other sessions see either the old or the committed new history.
No partially replaced history is exposed. Existing `actual_sale` rows and product
stock balances are not modified by the replacement.

A database lock rejects overlapping replacements. A retry carries the same
review request ID; a completed receipt returns without importing again, including
when an earlier response was lost or its review has since expired. A retry cannot
restore an older import over a newer one. Refresh work is requested once after
the complete replacement, rather than once per deleted/inserted observation.

The API service role cannot directly insert, update or delete demand observations
after this migration. Authorized stock-operation functions still record sales
inside their own transactions. This also blocks the older unsafe direct-delete
import path during deployment. Browser roles cannot call the replacement RPC.
If the API is updated before the migration, the missing RPC produces a setup
error; there is no fallback to delete-and-insert calls.

## Deploy an existing store

1. Preserve a current data export. For a store already through migration 0014,
   run [0015_atomic_demand_import.sql](../supabase/migrations/0015_atomic_demand_import.sql)
   in Supabase SQL Editor. The script installs functions and permissions; it does
   not import, clear or reset business data. Older stores must install their
   missing migrations first. The two-part fresh installer includes this migration.
2. Deploy the `production-v2` API and website. During the interval after applying
   SQL and before the updated API is deployed, the old forecasting importer is
   deliberately denied direct writes. Existing sales continue through the stock RPC.
3. On a separate test project, review a complete actual-history workbook, cancel
   once and verify unchanged counts, then confirm an authorized test replacement.
   Replay the same confirmed request after a lost response and check its receipt.

Read-only installation checks:

```sql
select to_regprocedure('public.demand_import_snapshot()') as review_function,
       to_regprocedure('public.replace_imported_demand(uuid,uuid,text,text,text,text,timestamptz,jsonb,integer,integer,jsonb)') as atomic_replace_function,
       has_table_privilege('service_role','public.demand_observations','DELETE') as unsafe_direct_delete,
       has_table_privilege('service_role','public.demand_observations','INSERT') as unsafe_direct_insert,
       has_function_privilege('authenticated','public.replace_imported_demand(uuid,uuid,text,text,text,text,timestamptz,jsonb,integer,integer,jsonb)','EXECUTE') as browser_can_replace;
```

Both functions should exist and the three permission flags should be false.

## Verification and limits

PostgreSQL tests inject an insert failure after deletion has begun and verify that
the original observations, actual sales, stock, receipts and refresh state survive.
They also cover a 701-row commit, expired/repeated receipts, stale reviews, invalid
data, inactive parts, denied browser/direct writes and migration reapplication.
Browser tests cover the impact confirmation, cancellation, multiple-file rejection,
missing setup, invalid rows and safe retry following an interrupted response.

This protects database integrity; it does not prove a file contains genuine sales
or establish forecasting accuracy. Do not include transactions already recorded
as actual sales in an imported-history replacement. Distinct same-day transactions
can have identical quantities, so they are not automatically deleted as duplicates.
Keep original evidence and retain independent exports for recovery from an
intentional but incorrect complete replacement. Deployment and live migration
must be verified separately from local tests.
