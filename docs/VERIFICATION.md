# Build Verification Notes

The source package was checked before delivery with the tools available in the build environment.

## Completed checks

- Every Node.js backend source file passed `node --check` syntax validation.
- Every React/JSX frontend source file passed TypeScript's JSX parser with `--noEmit`.
- `ml/train_forecast.py` passed Python byte-code compilation.
- The XGBoost script completed a synthetic end-to-end smoke test with two products, 100 days of dated demand per product, a 14-day horizon, 28 generated forecast rows, and MAE/RMSE/R² output.
- Raw NPG `.xlsx`/`.pdf` inputs are excluded by `.gitignore` and are not embedded in the source package.

## Deployment-time verification still required

The final `npm install`/Vite production build and Docker image dependency install happen on Render, because this packaging environment did not have the project's npm dependencies preinstalled. After the first Render build, confirm:

1. `/health` returns `{ "ok": true }`.
2. The frontend opens without console errors.
3. First-owner bootstrap works once, then refuses another bootstrap.
4. Both supplied Excel workbooks import through the protected Import Data page.
5. A stock-in, sale, and stock-out update stock correctly and appear in Transactions.
6. A manual Excel backup uploads and downloads with a temporary signed URL.
7. A verified supplier receives a manual Brevo test email.
8. After enough demand history exists, XGBoost training stores a completed run and product forecasts.
9. GitHub Actions can call `/jobs/daily` and `/jobs/forecast` using the cron secret.
