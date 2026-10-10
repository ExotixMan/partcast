# Free-Tier Deployment Guide

This deployment uses:

- **Supabase Free**: PostgreSQL, Auth, and private Storage
- **Render Free Static Site**: React frontend
- **Render Free Web Service**: one Docker service containing Node.js + Python/XGBoost
- **Gmail API**: required login codes and supplier email through Google OAuth and HTTPS
- **GitHub Actions**: scheduled job calls

Using one dynamic Render service is deliberate: Node.js is the API process and invokes Python locally for ML, so the project does not need a second ML web service.

## 1. Create Supabase

1. Create a new Supabase project.
2. Open **SQL Editor**.
3. Run `supabase/migrations/0001_schema.sql` completely.
4. Run `supabase/migrations/0002_rls.sql` completely.
5. Run `supabase/migrations/0003_training_import.sql` completely.

6. Run `supabase/migrations/0004_offline_security_notifications.sql` completely.
7. Run `supabase/migrations/0005_store_workflows.sql` completely.
8. Run `supabase/migrations/0006_access_roles.sql` by itself and let it commit.
9. Run `supabase/migrations/0007_verified_login_and_access.sql` separately.
10. Run `supabase/migrations/0008_restock_threshold.sql`.

For an existing database, apply only unapplied migrations. See [feature activation](STORE_WORKFLOWS.md) and [required Gmail login/roles](LOGIN_ROLES_FORECASTING.md). Configure Gmail OAuth on the API before deploying, and promote a trusted IT account to Super Admin for an existing installation.

11. In **Authentication settings**, disable public user signups. PartCast creates users through the server admin API.
12. Copy:
   - Project URL
   - anon/public key
   - service role key

The service role key is a server secret. Never put it in a `VITE_` variable.

## 2. Configure Gmail for login and supplier email

1. Enable Gmail API in your Google Cloud project and configure OAuth consent.
2. Create an OAuth client and authorize the sending Google account with `https://www.googleapis.com/auth/gmail.send` and offline access.
3. Enter `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `GMAIL_SENDER_EMAIL` privately on the API service.
4. Keep the store's existing integration encryption key stable. A new dedicated `INTEGRATION_ENCRYPTION_KEY` must be at least 32 characters; do not replace the key used to encrypt saved connections.
5. Test login-code delivery, then a reviewed supplier email to a controlled address.

Follow [Google setup and connection recovery](LOGIN_ROLES_FORECASTING.md) and the [step-by-step OAuth instructions](../supabase/paste-ready/README.md). Login codes and both manual/automatic supplier requests use the same Gmail connection. HTTPS avoids Render's SMTP port restrictions. Google account quotas and OAuth token validity still apply.

## 3. Push the repository

Create a private GitHub repository and push the `partcast` folder contents. Do not add the provided NPG `.xlsx` files. They are intentionally excluded by `.gitignore` and should be uploaded only through PartCast after authentication.

## 4. Deploy the Render Blueprint

1. In Render, choose **New > Blueprint** and connect the GitHub repository.
2. Render reads `render.yaml` and creates:
   - `partcast-npg-api` (Docker web service, Free)
   - `partcast-npg-web` (Static site)
3. Enter the API service secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
   - `GMAIL_SENDER_EMAIL`
4. Render generates `SETUP_SECRET`, `CRON_SECRET`, and `IP_HASH_SECRET`. Store/reveal them securely.
5. When the two Render URLs exist, set:
   - API: `FRONTEND_ORIGINS=https://<your-static-site>.onrender.com`
   - Web: `VITE_SUPABASE_URL=https://<project>.supabase.co`
   - Web: `VITE_SUPABASE_ANON_KEY=<anon key>`
   - Web: `VITE_API_URL=https://<your-api>.onrender.com`
6. Redeploy the static site after the `VITE_` variables are set.

## 5. Create the first owner

1. Open the PartCast frontend.
2. The app checks `/setup/status` and shows the one-time setup form when there are no profiles.
3. Enter the Render `SETUP_SECRET`, Super Admin name, email, and a strong password.
4. After it succeeds, the setup endpoint permanently refuses a second bootstrap because a profile now exists.
5. Sign in.

## 6. Import the provided NPG Excel data

Use **Import Data** while signed in as Owner/Admin.

Recommended order:

1. Upload `Inventory-npg(1).xlsx` to the Inventory importer.
2. Upload `CUST-REF-TRANS(1).xlsx` to the Customer Reference importer.

The legacy customer workbook does not reliably expose item quantity. Keep **Create 1-unit legacy demand proxy** OFF for scientifically cleaner data. Turn it on only if the capstone team intentionally wants transaction-count proxy observations for an XGBoost demonstration and clearly documents that limitation.

After import:

- review product stock and minimum/safety stock;
- add supplier email addresses (the supplied workbook contains supplier names but not a complete supplier-email directory);
- assign primary suppliers to products that need replenishment.

## 7. Enable scheduled backup and forecasts

In GitHub repository **Settings > Secrets and variables > Actions**, create:

- `PARTCAST_API_URL` = the Render API origin, e.g. `https://partcast-npg-api.onrender.com`
- `PARTCAST_CRON_SECRET` = exactly the Render `CRON_SECRET`

`.github/workflows/daily-jobs.yml` then provides:

- Daily: Excel backup + supplier emails if automatic email is enabled in PartCast Settings.
- Weekly: refresh XGBoost forecasts using actual quantity observations.
- Manual: **Run workflow** from the GitHub Actions UI.

GitHub scheduled workflows can run later than the exact cron minute during platform load, so do not treat them as a real-time scheduler.

## 8. Turn on automatic supplier email

1. Confirm Gmail shows as configured in **Settings**; Super Admin manages the connection in **IT settings**.
2. Add supplier email addresses.
3. Assign suppliers as primary suppliers to products.
4. Train a forecast and review reorder recommendations.
5. Test **Review supplier email** manually first. Edit the message, quantities and extra columns before sending.
6. In **Settings**, enable **Automatic supplier email**.
7. Set the email cooldown days (default 3) to prevent repeated identical messages.

The email is a replenishment request, not an automatic purchase order. Staff still review supplier replies and purchasing decisions.

Parts at or below their low-stock level appear in Restock even without a forecast. See [stock fields and email table customization](RESTOCK_GMAIL.md).

## 9. Backups

The daily job generates a real `.xlsx` workbook from live data and uploads it to the private `partcast-backups` Supabase Storage bucket. It contains separate worksheets for products, transactions, suppliers, product-supplier links, demand observations, forecast runs/results, legacy sales, purchase history, import batches, staff profiles, and non-secret system settings. Owner/Admin users can also create one manually from **Backups**.

Because the Supabase Free plan has storage limits and does not include platform-managed automatic database backups, PartCast's Excel backup is an application-level portability backup. It is not a replacement for a PostgreSQL point-in-time recovery service.

## 10. First XGBoost run

The model needs dated quantity observations and requires enough history to create 28-day lag features. Normal PartCast sales automatically create actual demand observations. When the legacy proxy option is not used, the team should collect enough real sales history before evaluating forecasting accuracy.

The Forecast page stores and shows MAE, RMSE, R², training/test counts, model version, and run history.


## AI-assisted chatbot

The chatbot works immediately in Smart Local mode using live PartCast data. To enable Gemini-assisted wording, add `GEMINI_API_KEY` to the Render API service and keep `GEMINI_MODEL=gemini-2.5-flash`. Never add the Gemini key to the React static-site variables. The server sends only minimized inventory/forecast context and deliberately excludes customer names, supplier email addresses, passwords, and other secrets.
