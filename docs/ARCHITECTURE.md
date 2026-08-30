# PartCast Architecture

```text
Browser (React + Tailwind)
        |
        | Supabase login -> access token
        | HTTPS Bearer token
        v
Render Docker Web Service
Node.js / Express API
  |       |          |
  |       |          +--> Brevo REST API -> supplier email
  |       |
  |       +--> Python child process -> XGBoost training / forecasting
  |                       |
  |                       +--> JSON results + model artifact
  |
  +--> Supabase
       - Postgres business data
       - Auth users
       - private backup bucket
       - private model bucket

GitHub Actions (scheduled)
  -> /jobs/daily     -> Excel backup + optional supplier emails
  -> /jobs/forecast  -> weekly XGBoost refresh
```

## Why Node and Python are in one Render service

The backend is intentionally one Docker service. Express remains the application backend, while it launches the Python forecasting script for ML work. This satisfies the Node.js + Python architecture without requiring two continuously billed/limited web services. It also avoids sending sensitive training rows to a separate public ML endpoint.

## Forecast pipeline

1. Each real PartCast sale creates an `actual_sale` demand observation with product, date, and quantity.
2. Optional legacy proxy observations are stored separately and are clearly labeled.
3. The server writes observations to a temporary JSON file and launches `ml/train_forecast.py`.
4. Python aggregates daily demand, creates lag and rolling-window features, and trains a global XGBoost regression model.
5. Holdout metrics include MAE, RMSE, R², and MAPE when valid.
6. Python recursively forecasts 7-90 future days for products with sufficient history.
7. The server stores forecast rows in PostgreSQL and the model JSON in a private Supabase Storage bucket.
8. Reorder quantity uses forecast demand + safety stock - current stock, with a floor of zero.

## Main tables

- `profiles`
- `products`
- `suppliers`
- `product_suppliers`
- `inventory_transactions`
- `demand_observations`
- `legacy_sales`
- `purchase_history`
- `forecast_runs`
- `demand_forecasts`
- `supplier_email_logs`
- `backup_logs`
- `audit_logs`
- `system_settings`
- `import_batches`
