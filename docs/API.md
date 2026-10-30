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
- `GET /api/transactions`

## Suppliers / reorder

- `GET /api/suppliers`
- `POST /api/suppliers`
- `PATCH /api/suppliers/:id`
- `POST /api/products/:productId/suppliers/:supplierId`
- `GET /api/reorder`
- `POST /api/admin/supplier-email/:supplierId`

## Forecasting

- `GET /api/forecast/runs`
- `GET /api/forecast/products` — all active products, including products without a trained forecast; includes live `current_stock`, `predicted_total`, and `forecast_days`.
- `GET /api/forecast/product/:id`
- `POST /api/forecast/train`
- `GET /api/data-quality`

`GET /api/forecast/product/:id` returns `{ data, product, actualSales, run, today }`.
`data` contains future predictions from the latest completed run only, avoiding
duplicate dates from older models. `product` includes current stock and thresholds;
`actualSales` contains actual-sale observations for the last 30 days, inclusive of
`today` (UTC). Products without predictions still return stock and actual sales.

## Imports / reports / backups

- `POST /api/imports/inventory`
- `POST /api/imports/legacy-sales`
- `GET /api/imports`
- `GET /api/reports/inventory.xlsx`
- `GET /api/reports/transactions.xlsx`
- `GET /api/reports/reorder.xlsx`
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
