# Deployment

Use the **production** branch for both Render services and the GitHub default branch. Changing the default branch requires repository settings access. GitHub scheduled workflows run from that default branch.

## Database and API

Back up existing data. Apply only unapplied [migrations](../supabase/migrations) in order through `0012_sale_financial_integrity.sql`. Run 0006 by itself and commit before 0007. Existing stores through 0011 need only 0012. A reset and inventory reimport are unnecessary. Fresh installations can use the [two-part installer](../supabase/paste-ready/README.md).

For a Docker API, use the root Dockerfile. For an existing native Render Node API, leave Root Directory blank, set Build Command to `bash scripts/render-build.sh`, Start Command to `bash scripts/render-start.sh`, and Health Check Path to `/health`. Both paths install/check Python with numpy, pandas, scikit-learn and xgboost. A Node-only npm install cannot run forecasting.

The API needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, exact `FRONTEND_ORIGINS`, stable random `SETUP_SECRET`, `CRON_SECRET` and `IP_HASH_SECRET`, and Gmail OAuth settings. Preserve the encryption key already used for saved Google connections. For new installations use a dedicated random `INTEGRATION_ENCRYPTION_KEY` of at least 32 characters. Never rotate an existing key without migrating encrypted settings.

Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `GMAIL_SENDER_EMAIL` privately on the API. Authorize the sender with `gmail.send` and offline access using the same OAuth client. See [Google connection setup](LOGIN_ROLES_FORECASTING.md). Gmail sends sign-in codes and staff-reviewed supplier requests. Unattended supplier emails are disabled. Gemini fallback is optional: configure `GEMINI_API_KEY` and the enabled `GEMINI_MODEL` on the API only.

Disable public Supabase signups. The first Super Admin uses PartCast's one-time setup and the API's setup secret; later staff are managed through Staff access. Use matching project keys and keep the service-role key off the website.

## Website

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` before building. The existing website is `https://partcast-web.onrender.com`; its API origin is `https://partcast.onrender.com`. `FRONTEND_ORIGINS` on the API must include the exact website origin. Rebuild after changing website variables.

`render.yaml` includes the static-site security headers. For an existing manually created static site, enter its `headers` rules in Render's Headers settings as well; pushing YAML does not apply Blueprint settings to unrelated manual services. If using a custom API, domain or Supabase host, update CSP `connect-src` for those exact destinations. Preserve camera permission and blob image/worker support for scanning, photos and the PWA.

Apply the database upgrade first, then deploy the API and website. Confirm both services show the intended commit. Check `/health`, password plus email-code login, account role, inventory loading and notification refresh. A successful build is not proof that live credentials or email delivery work. Run write tests only in a separate test project or on specifically authorized real transactions.

## Backups and scheduled forecasts

GitHub Actions needs `PARTCAST_API_URL` and `PARTCAST_CRON_SECRET` in repository Actions secrets. The workflow runs a daily Excel backup and a weekly forecast. Manual supplier requests remain in Restock; the legacy supplier cron route returns a skipped result. Cron timing is best effort.

Excel backups are private application exports, not a full PostgreSQL/Auth/Storage restore. Preserve actual photo files and a database backup through a separate retention process. Test restore in a separate project. Free hosting can sleep or hit memory/storage limits; review provider capacity before relying on uninterrupted store operation.

## Forecast activation

The API logs must report a ready Python forecasting runtime. Import reviewed current inventory before actual dated part-level sale quantities, then inspect import results and unmatched parts. An invoice amount or delivery quantity is not customer demand. Avoid replaying an old stock snapshot after sales have changed current stock.

A working pipeline cannot guarantee accurate buying estimates. Evaluate complete future planning periods, compare WAPE and MAE with the recent-sales baseline, and preserve source provenance. See [Forecasting data](FORECASTING_DATA.md) and [Verification](VERIFICATION.md).
