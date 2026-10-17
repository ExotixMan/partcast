# Find imported invoices

Open **Import spreadsheets → Saved past sales** to browse records saved by
**Past sales and customer records**. The list reads `legacy_sales` from the
store database and refreshes after every import attempt, including an attempt
whose completion could not be confirmed. It also loads existing records after
a page reload. No reimport is required just to display existing invoices.

Search an invoice reference or description, filter by inclusive sale dates,
and browse 20 invoices per page. Dates default to **all saved dates** so older
imports are visible. Invoices with an unknown date remain visible without a
date filter. A failed read shows an error and retry button; it does not claim
that the database contains zero invoices.

The list shows invoice reference, date, description, and recorded PHP amount.
It does not infer quantities from amounts or change inventory. Invoice
records remain separate from sales recorded at the counter and from the
dated part quantities used by forecasting. Successful invoice import does
not establish that XGBoost has sufficient history or that its error improved.

**Import results** and **Past imports** now display the saved import notes,
including skipped duplicate references and conflicting records. An import
that completes with zero added rows says so explicitly. Existing conflicting
invoice references are still preserved rather than overwritten.

## Activation

Deploy the API and website from the same commit on
`codex/partcast-offline-forecasting-20261009`. No database migration or new
environment variables are needed. The API adds `GET /api/imports/sales`;
an older API will not serve the new browser. This endpoint requires an active,
email-verified Owner, Admin, or Super Admin. Cashiers and inventory staff
cannot read this invoice browser. Customer contact fields are not returned.

## Verification

- An HTTP test imports a real Excel fixture with the existing importer, then
  reads the saved invoices through the new endpoint. It checks duplicates,
  inclusive date filters, pagination, search syntax, validation, and role and
  email-code restrictions. Browsing performs no writes.
- Browser checks cover automatic refresh after import, zero-added feedback,
  persistent import notes and records after reload, search and dates,
  pagination, phone/tablet/desktop layouts, Tagalog, and read-error recovery.

These checks use isolated fixtures. They do not import data into hosted
Supabase, establish the live invoice count, or deploy Render.
