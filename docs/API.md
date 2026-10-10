# API Overview

All `/api/*` endpoints require a Supabase Bearer access token. `/api/admin/*` additionally requires Admin or Owner as appropriate. `/jobs/*` requires `X-Cron-Secret`.

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

Basket, debt, and payment writes require an active owner/admin/inventory_staff account and a UUID `client_operation_id`. Identical retries return the original result; different content with an existing ID is rejected. Customer ledger/history writes go through `sync_store_operation`; direct authenticated inserts/updates/deletes are denied.

## Suppliers / reorder

- `GET /api/suppliers`
- `POST /api/suppliers`
- `PATCH /api/suppliers/:id`
- `POST /api/products/:productId/suppliers/:supplierId`
- `GET /api/reorder`
- `POST /api/admin/supplier-email/:supplierId`

## Forecasting

- `GET /api/forecast/runs`
- `GET /api/forecast/product/:id`
- `POST /api/forecast/train`
- `GET /api/data-quality`

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
- `GET /api/admin/settings`
- `PATCH /api/admin/settings/:key` (Owner)

## Scheduled jobs

- `POST /jobs/daily`
- `POST /jobs/backup`
- `POST /jobs/forecast`
- `POST /jobs/supplier-email`

## Supplier email drafts and email-code login

`POST /api/admin/supplier-email/:supplierId` accepts an optional reviewed draft: `{subject, message, items:[{product_id, part_number, description, quantity}]}`. Without a body the existing automatic recommendation draft remains available. Recipients are read from the saved supplier; the request cannot choose an arbitrary recipient. Products are checked against that supplier's recommendations.

The website uses Supabase Auth `signInWithOtp({email, options:{shouldCreateUser:false}})` and `verifyOtp({email, token, type:'email'})` directly. PartCast does not expose its own OTP generator or verification endpoint. Active-profile authorization is enforced on API requests after either login method.
