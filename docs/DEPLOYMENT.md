# Free-Tier Deployment Guide

This deployment uses:

- **Supabase Free**: PostgreSQL, Auth, and private Storage
- **Render Free Static Site**: React frontend
- **Render Free Web Service**: one Docker service containing Node.js + Python/XGBoost
- **Brevo Free**: supplier transactional email through HTTPS API
- **GitHub Actions**: scheduled job calls

Using one dynamic Render service is deliberate: Node.js is the API process and invokes Python locally for ML, so the project does not need a second ML web service.

## 1. Create Supabase

1. Create a new Supabase project.
2. Open **SQL Editor**.
3. Run `supabase/migrations/0001_schema.sql` completely.
4. Run `supabase/migrations/0002_rls.sql` completely.
5. Run `supabase/migrations/0003_training_import.sql` completely.

If this is an existing PartCast database that already has 0001 and 0002, only run 0003 for this update.
5. In **Authentication settings**, disable public user signups. PartCast creates users through the server admin API.
6. Copy:
   - Project URL
   - anon/public key
   - service role key

The service role key is a server secret. Never put it in a `VITE_` variable.

## 2. Configure Brevo for supplier email

1. Create a Brevo account.
2. Add and verify a sender email/domain.
3. Create an API key.
4. Save the API key for Render as `BREVO_API_KEY`.
5. Save the verified sender as `BREVO_SENDER_EMAIL`.

PartCast uses the Brevo HTTPS endpoint instead of SMTP. This works with Render free services even though common outbound SMTP ports are restricted.

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
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
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
3. Enter the Render `SETUP_SECRET`, owner name, owner email, and a strong password.
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

1. Confirm Brevo shows as configured in **Settings**.
2. Add supplier email addresses.
3. Assign suppliers as primary suppliers to products.
4. Train a forecast and review reorder recommendations.
5. Test **Email supplier** manually first.
6. In **Settings**, enable **Automatic supplier email**.
7. Set the email cooldown days (default 3) to prevent repeated identical messages.

The email is a replenishment request, not an automatic purchase order. Staff still review supplier replies and purchasing decisions.

## 9. Backups

The daily job generates a real `.xlsx` workbook from live data and uploads it to the private `partcast-backups` Supabase Storage bucket. It contains separate worksheets for products, transactions, suppliers, product-supplier links, demand observations, forecast runs/results, legacy sales, purchase history, import batches, staff profiles, and non-secret system settings. Owner/Admin users can also create one manually from **Backups**.

Because the Supabase Free plan has storage limits and does not include platform-managed automatic database backups, PartCast's Excel backup is an application-level portability backup. It is not a replacement for a PostgreSQL point-in-time recovery service.

## 10. First XGBoost run

The model needs dated quantity observations and requires enough history to create 28-day lag features. Normal PartCast sales automatically create actual demand observations. When the legacy proxy option is not used, the team should collect enough real sales history before evaluating forecasting accuracy.

The Forecast page stores and shows MAE, RMSE, R², training/test counts, model version, and run history.


## AI-assisted chatbot

The chatbot works immediately in Smart Local mode using live PartCast data. To enable Gemini-assisted wording, add `GEMINI_API_KEY` to the Render API service and keep `GEMINI_MODEL=gemini-2.5-flash`. Never add the Gemini key to the React static-site variables. The server sends only minimized inventory/forecast context and deliberately excludes customer names, supplier email addresses, passwords, and other secrets.
