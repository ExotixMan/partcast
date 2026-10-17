# API Overview

All `/api/*` endpoints require a validated Supabase password-session Bearer token, an active staff profile and a session-bound unexpired email verification. Missing verification returns HTTP 428 with `code: OTP_REQUIRED`. `/api/admin/*` additionally requires Super Admin, Owner or Admin as appropriate; IT endpoints require Super Admin only. `/jobs/*` requires `X-Cron-Secret`.

## Core

- `GET /health`
- `GET /setup/status`
- `POST /setup/bootstrap`
- `GET /api/me`
- `GET /api/dashboard`

## Inventory

- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `PATCH /api/products/:id`
- `POST /api/inventory/movement`
- `GET /api/transactions` (`from`, `to` calendar dates)
- `POST /api/inventory/batch` (1–100 unique lines; stable `client_operation_id`; atomic sale/delivery and optional customer credit)
- `GET /api/barcode/:code` (exact saved barcode)
- `GET /api/photos/:productId/:file` (private authenticated image)
- `POST /api/photos/:productId` (one JPEG/PNG/WebP multipart `file`, <=5 MB)
- `DELETE /api/photos/:productId/:file`

Products support `category`, nullable `barcode`, `search_aliases`, and server-managed `photo_paths`. Product list queries support `category`, search, status and pagination.

## Customer utang

- `GET /api/debts` (current balances)
- `POST /api/debts` (existing customer balance)
- `GET /api/debts/:id/payments`
- `POST /api/debts/payment` (partial/full payment; overpayment rejected)

Basket writes allow verified Super Admin/Owner/Admin/Inventory staff/Cashier accounts; debt/payment writes allow verified non-Cashier staff and a UUID `client_operation_id`. Identical retries return the original result; different content with an existing ID is rejected. Customer ledger/history writes go through `sync_store_operation`; direct authenticated inserts/updates/deletes are denied.

## Suppliers / reorder

- `GET /api/suppliers`
- `POST /api/suppliers`
- `PATCH /api/suppliers/:id`
- `POST /api/products/:productId/suppliers/:supplierId`
- `GET /api/reorder` (`onlyNeeded=true` includes low/out-of-stock parts and forecast suggestions; `onlyNeeded=false&supplierId=<uuid>` lists all active parts assigned to that supplier)
- `POST /api/admin/supplier-email/:supplierId` (Gmail; optional reviewed draft with subject, message, 1–100 distinct assigned parts and up to 5 custom text columns)

Draft `extra_columns` contains `{id: <uuid>, label: <1–50 characters>}` entries. Each item includes `product_id`, `part_number`, `description`, positive two-decimal `quantity`, optional `unit`, and `extra_values: {<column uuid>: <text up to 300 characters>}`. Column IDs/names must be unique; unknown column values and core-column duplicates are rejected. The recipient remains the saved supplier email; sending does not change stock. Omit the draft to send the saved recommendations. See [Restock/Gmail workflow](RESTOCK_GMAIL.md).

## Forecasting

- `GET /api/forecast/status` (engine readiness)
- `GET /api/forecast/products`
- `GET /api/forecast/runs`
- `GET /api/forecast/product/:id`
- `POST /api/forecast/train`
- `POST /api/forecast/demo/jobs` and `GET /api/forecast/demo/jobs/:id`
  (verified managers; separate simulated evaluation with no store-data writes)
- `GET /api/data-quality`
- `GET /api/imports/sales` — verified manager access; saved invoice references,
  dates, descriptions and amounts. Supports `q`, inclusive `from`/`to` dates,
  `page` (default 1) and `pageSize` (default 20, maximum 50). Returns
  `{ data, count, page, pageSize }`. Invoice records are separate from actual
  sold quantities and counter transactions.

Store readiness/training rejects `includeProxy=true`. Imported quantities are
used, but invoice-count estimates are excluded. `useProxy=true` is rejected
before a past-sales batch is created. The labelled sample is downloadable at
`/examples/PartCast_Forecasting_DEMO.xlsx` on the website and runs only in
the isolated **`/forecast-demo`** page.

## Imports / reports / backups

- `POST /api/imports/inventory`
- `POST /api/imports/legacy-sales`
- `GET /api/imports`
- `GET /api/reports/inventory.xlsx`
- `GET /api/reports/transactions.xlsx`
- `GET /api/reports/reorder.xlsx`
- `GET /api/reports/sales.xlsx`
- `GET /api/reports/debts.xlsx`

Reports accept `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (inclusive Philippines calendar dates), and `category`. Inventory quantities, restock suggestions and customer balances remain current. See [report semantics](STORE_WORKFLOWS.md#download-excel-reports).

- `POST /api/admin/backups`
- `GET /api/admin/backups`
- `GET /api/admin/backups/:id/download`

## Administration

- `GET /api/admin/users`
- `POST /api/admin/users` (Owner)
- `PATCH /api/admin/users/:id` (Owner)
- `GET /api/admin/audit`
- `GET /api/admin/integrations` (Super Admin; masked presence/status only)
- `PATCH /api/admin/integrations/:provider` (Super Admin; `gmail` or `gemini`; encrypted storage)
- `POST /api/admin/integrations/:provider/test` (Super Admin; checks saved connection)
- `GET /api/admin/store-status` (business email readiness)
- `GET /api/admin/system-status` (Super Admin)
- `GET /api/admin/settings`
- `PATCH /api/admin/settings/:key` (Owner)

The retired `auto_supplier_email_enabled` and
`include_legacy_proxy_by_default` flags cannot be enabled. Existing cron
supplier-email URLs return a skipped result; staff edit and send requests
through the manual supplier-email endpoint. See [capstone scope](CAPSTONE_SCOPE.md).

## Scheduled jobs

- `POST /jobs/daily`
- `POST /jobs/backup`
- `POST /jobs/forecast`
- `POST /jobs/supplier-email`

## Supplier email drafts and email-code login

`POST /api/admin/supplier-email/:supplierId` accepts an optional reviewed draft: `{subject, message, items:[{product_id, part_number, description, quantity}]}`. Without a body the existing automatic recommendation draft remains available. Recipients are read from the saved supplier; the request cannot choose an arbitrary recipient. Products are checked against that supplier's recommendations.

The website first calls Supabase `signInWithPassword`. It then calls `POST /auth/otp/request` using that password session's bearer token. The recipient is the validated account email; the request cannot choose a different recipient. `POST /auth/otp/verify` accepts `{code:"123456"}` and grants that session 12 hours of store access. `POST /auth/logout` revokes its verification. These `/auth` endpoints require a validated active password session, but not yet an email verification. See [code limits, roles and Google configuration](LOGIN_ROLES_FORECASTING.md).


## Separate database walkthrough

`PARTCAST_DEMO_MODE=true` is an API environment option for a separate Supabase
project prepared with the generated-data seed. The API also requires the
`partcast_demo_environment` database marker; the flag alone is insufficient.
`GET /api/me` reports `user.data_environment`. Normal mode selects only
`actual_sale` and `imported_training_data`; database demo mode selects only
`simulated_demo`, including on the normal readiness, training, sales-summary
and cron forecast paths. Forecast metrics retain `data_mode=simulated_demo`
and `production_accuracy_established=false`. Normal spreadsheet imports still
reject generated demand. See [DEMO_DATABASE.md](DEMO_DATABASE.md) for the SQL,
project configuration and walkthrough.
