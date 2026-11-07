# Deployment

Use the **production** branch for both Render services and the GitHub default branch. Changing the default branch requires repository settings access. GitHub scheduled workflows run from that default branch.

## Database and API

Back up existing data. Apply only unapplied [migrations](../supabase/migrations) in order through `0015_atomic_demand_import.sql`. Run 0006 by itself and commit before 0007. Existing stores through 0014 need only 0015; older stores need their missing migrations in order. The updated two-part installer includes the latest migrations for fresh projects. A reset and inventory reimport are unnecessary. Fresh installations can use the [two-part installer](../supabase/paste-ready/README.md). See [safe forecasting imports](SAFE_FORECAST_IMPORTS.md) for the migration/deployment order and checks.

For a Docker API, use the root Dockerfile. For an existing native Render Node API, leave Root Directory blank, set Build Command to `bash scripts/render-build.sh`, Start Command to `bash scripts/render-start.sh`, and Health Check Path to `/health`. Both paths install/check Python with numpy, pandas, scikit-learn and xgboost. A Node-only npm install cannot run forecasting.

The API needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, exact `FRONTEND_ORIGINS`, stable random `SETUP_SECRET`, `CRON_SECRET` and `IP_HASH_SECRET`, and Gmail OAuth settings. Preserve the encryption key already used for saved Google connections. For new installations use a dedicated random `INTEGRATION_ENCRYPTION_KEY` of at least 32 characters. Never rotate an existing key without migrating encrypted settings.

Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `GMAIL_SENDER_EMAIL` privately on the API. Authorize the sender with `gmail.send` and offline access using the same OAuth client. See [Google connection setup](LOGIN_ROLES_FORECASTING.md). Gmail sends sign-in codes and staff-reviewed supplier requests. Unattended supplier emails are disabled. Gemini fallback is optional: configure `GEMINI_API_KEY` and the enabled `GEMINI_MODEL` on the API only.

Disable public Supabase signups. The first Super Admin uses PartCast's one-time setup and the API's setup secret; later staff are managed through Staff access. Use matching project keys and keep the service-role key off the website.

## Website

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` before building. The existing website is `https://partcast-web.onrender.com`; its API origin is `https://partcast.onrender.com`. `FRONTEND_ORIGINS` on the API must include the exact website origin. Rebuild after changing website variables.

`render.yaml` includes the static-site security headers. For an existing manually created static site, enter its `headers` rules in Render's Headers settings as well; pushing YAML does not apply Blueprint settings to unrelated manual services. If using a custom API, domain or Supabase host, update CSP `connect-src` for those exact destinations. Preserve camera permission and blob image/worker support for scanning, photos and the PWA.

Apply the database upgrade first, then deploy the API and website. Confirm both services show the intended commit. Check `/health`, password plus email-code login, account role, inventory loading and notification refresh. A successful build is not proof that live credentials or email delivery work. Run write tests only in a separate test project or on specifically authorized real transactions.

## Login bot protection

PartCast supports the classic Google reCAPTCHA v2 **“I’m not a robot” Checkbox**. Register the exact website hostname `partcast-web.onrender.com` at [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin/create). Use v2 Checkbox keys that support the classic `siteverify` endpoint, not v3, invisible or Enterprise assessment keys. This is separate from Gmail OAuth branding verification.

1. Deploy the API and website code before enabling the keys. In the static website’s Render Headers settings, update Content-Security-Policy to match `render.yaml`, keeping any custom API origins. reCAPTCHA requires the Google/gstatic script and Google frame destinations listed there. Pushing YAML only updates services managed by that Blueprint.
2. On the Render **API service**, set `RECAPTCHA_SITE_KEY=6LfnIhEuAAAAAJU50RIpM40Pv2B4wjMm6S7VhaD7` (the owner-provided public key) and `RECAPTCHA_SECRET_KEY` to its matching private Secret Key, together, then redeploy the API. Keep the Secret Key out of chat, the repository and all `VITE_` variables. `/setup/status` publishes only the public Site Key; no separate website rebuild is needed to change it. Leave both keys blank until setup is ready to preserve existing login. Do not use Google’s public demo keys in production.
3. Keep public Supabase signups disabled. Supabase’s native CAPTCHA option supports other providers and should remain off for this Google integration; PartCast verifies Google challenges on its own API.
4. In a private window, verify the checkbox, password and email-code steps with a dedicated test account. Check that missing, invalid, expired or wrong-host challenge tokens cannot issue an email code, and that a completed check does not replace the email code. Never run email or write tests against real staff accounts without authorization.

With keys configured, PartCast’s password endpoint verifies the single-use Google token before checking the password. It returns a signed proof bound to that user and password session, valid for ten minutes, so a normal email-code resend does not require another puzzle. The proof stays in memory and its expiry is not extended by resending. Reloading the email-code page requires a fresh checkbox check before another email can be sent. Tokens expire after two minutes and every password attempt requires a new check.

The email-code endpoint independently requires the signed proof or a fresh Google token; calling Supabase’s public password endpoint directly cannot bypass that requirement or grant store access. Supabase separately rate-limits its password endpoint. Existing verified sessions retain their usual expiry. No database migration or change to Gmail delivery is required.

Public policy and homepage sign-in links use `/`, the actual static app entry, so they work even if a manually configured host lacks the SPA rewrite for `/login`. Keep the `/* → /index.html` rewrite in Render for direct links and page refreshes throughout the app.

## Backups and scheduled forecasts

GitHub Actions needs `PARTCAST_API_URL` and `PARTCAST_CRON_SECRET` in repository Actions secrets. The workflow runs a daily Excel backup and a weekly forecast. Manual supplier requests remain in Restock; the legacy supplier cron route returns a skipped result. Cron timing is best effort.

Excel backups are private application exports, not a full PostgreSQL/Auth/Storage restore. Preserve actual photo files and a database backup through a separate retention process. Test restore in a separate project. Free hosting can sleep or hit memory/storage limits; review provider capacity before relying on uninterrupted store operation.

## Forecast activation

The API logs must report a ready Python forecasting runtime. Import reviewed current inventory before actual dated part-level sale quantities, then inspect import results and unmatched parts. An invoice amount or delivery quantity is not customer demand. Avoid replaying an old stock snapshot after sales have changed current stock.

A working pipeline cannot guarantee accurate buying estimates. Evaluate complete future planning periods, compare WAPE and MAE with the recent-sales baseline, and preserve source provenance. See [Forecasting data](FORECASTING_DATA.md) and [Verification](VERIFICATION.md).
