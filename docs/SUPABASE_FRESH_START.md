# Rebuild PartCast with a new Supabase project

This is a **clean installation**, with new accounts, default store settings and an empty inventory. It does not restore an old SQL backup. Keep the current project available until the replacement has passed the checks below. The website and API can keep their existing Render addresses.

The setup ZIP contains only reviewed application SQL and these instructions. It contains no customer records, passwords, tokens, Google credentials or contents from `full_backup.sql`.

## 1. Finish work and keep your rollback copy

Pause selling and receiving during the switch. On every phone, tablet and computer, connect to the internet and use **Send changes**; resolve any pending/conflicting changes before signing out. Export the current inventory, sales, customer utang/payments and supplier details that you need to keep. Save actual photos and any other wanted files from Supabase Storage separately.

Keep `full_backup.sql` private. It contains password hashes, sessions and refresh tokens. The inspected backup has 1,506 products, 20 suppliers, 5,848 legacy sales rows, 235 purchase-history rows, 4 stock transactions, 1 customer debt and only 27 demand observations. Its 9 Storage object records are metadata, not the actual file contents. A SQL backup alone cannot restore the photos or other stored files.

Do not paste that full dump into SQL Editor. It contains pg_dump/psql COPY commands and Supabase-managed Auth, Storage and Realtime schemas. Reimporting it would also bring back the old records and account state you asked to replace.

## 2. Create the replacement project

In the Supabase dashboard, create a new project in your organization, choose the region and save its database password privately. Wait for the project to finish starting. If your plan has no available project slot, stop here: do not delete the old project just to make space. Arrange an available project slot first.

In the **new project's** SQL Editor, use the `postgres` role. Download and extract `PartCast_Fresh_Supabase_Setup.zip` from `downloads/setup` on the PartCast GitHub branch. Open each `.sql` file in a text editor, select its entire contents and paste into a new query:

1. Run **01_schema_and_roles.sql**, and wait for success. It checks for an empty project's accounts, application tables and Storage buckets before installing anything. If it reports existing data, select the correct new project. This fresh-only Part 1 must not be rerun after installation; it intentionally refuses an already installed project.
2. In a **separate SQL Editor execution**, run **02_login_and_permissions.sql** and wait for success. PostgreSQL needs Part 1's role changes committed first. If Part 2 fails, correct that error and rerun the whole Part 2; do not rerun fresh-only Part 1 or remove tables.
3. Run **03_verify_installation.sql** separately. Expect a **PASS** result, zero accounts/profiles/inventory/demand records and the three private Storage buckets. Default store settings are created by installation. You can rerun this read-only check later; counts will then reflect the imported records.

Keep public Auth signups disabled. Do not create a user manually in Supabase before the first-account setup below.

## 3. Point Render at the new project

In the **new Supabase project → Settings → API / API Keys**, obtain the project URL and the legacy `anon` and `service_role` keys. Use all three from the same project. Enter values privately in Render; never paste them into chat, SQL, GitHub, or a spreadsheet.

| Render service | Environment variable | New value |
| --- | --- | --- |
| API: `https://partcast.onrender.com` | `SUPABASE_URL` | New Supabase project URL |
| API | `SUPABASE_ANON_KEY` | New project's public `anon` key |
| API | `SUPABASE_SERVICE_ROLE_KEY` | New project's private `service_role` key |
| Website: `https://partcast-web.onrender.com` | `VITE_SUPABASE_URL` | Same new project URL |
| Website | `VITE_SUPABASE_ANON_KEY` | Same public `anon` key |

The private `service_role` key belongs only on the API service. Keep `VITE_API_URL=https://partcast.onrender.com` and `FRONTEND_ORIGINS=https://partcast-web.onrender.com`. Keep the API's existing Gmail, Gemini, `SETUP_SECRET`, `CRON_SECRET`, `IP_HASH_SECRET` and `INTEGRATION_ENCRYPTION_KEY` values. They are Render settings and are not reset by a database change. Connections saved only in PartCast's old database must be entered again.

Use branch `codex/partcast-offline-forecasting-20261009` for both Render services. For the native **Node API**, keep Root Directory blank, Build Command `bash scripts/render-build.sh`, Start Command `bash scripts/render-start.sh`, and Health Check Path `/health`. Save/redeploy the API, then rebuild/deploy the website so its `VITE_` values are included. Wait for both deployments to be Live before staff use the application. The old project remains available if you need to revert both services' Supabase settings and redeploy them.

## 4. Create your new Super Admin and import records

Open the updated website while online. If it still opens an old session, sign out and reload after confirming there are no unsent changes. The login page checks the new API and should show initial account setup. Enter your name, email, a new password of at least 10 characters and the API's existing `SETUP_SECRET` privately in that form. This creates the first active **Super Admin**. Then sign in using your password and the emailed code. Add other staff through PartCast Staff access with their intended roles.

Import the verified **current inventory snapshot first**, then actual sales history. Use the app's **Import spreadsheets** page and review each result. Preserve source part numbers and quantities. Historical dates and quantities must come from actual records. Only reimport current-stock inventory once; repeating a snapshot after new sales can overwrite stock counts.

For this **new empty database**, use [the fresh-start import files](../downloads/fresh-start-import/README.md): first `01_Inventory_Import.xlsx` (1,506 items), then `02_Actual_Sales_History_Import.xlsx` (27 dated demand rows). The latter includes the 23 imported observations and four former PartCast sale observations as forecasting history; it does not replay the four financial transactions or subtract stock again. These files preserve the supplied backup's quantities and prices. Do not subsequently import the older 23-row file, which would replace this 27-row imported history. That older file is intended for the old database where the four original PartCast sales still exist.

These two spreadsheets are not a full restore: they exclude the 5,848 legacy invoice rows, suppliers/links, purchases, debts/payments, users, stock-movement ledger, photos and forecast models. Normal spreadsheet import does not reconstruct all of these tables. Retain the old project/exports and reconcile any required balances and history before switching the store fully. Upload photos again and reconfigure suppliers and store settings.

Do not upload the owner-labelled workbook's generated daily quantities as actual sales. Changing a label does not change the origin of those quantities. Keep any simulated forecast exercise separate from store records.

## 5. Verify before using the replacement

Check Gmail password-plus-code login, the correct Super Admin/Owner/Cashier pages, inventory item counts and stock/price totals, supplier details, opening customer balances and photos. Reconcile imports against source documents. If you record a real sale or delivery, confirm its stock movement and notification updates; use a separate test project for invented test transactions. For an offline check, record an authorized real transaction on one device offline, reconnect, and confirm it synchronizes once.

On the API build/start logs, check for `"forecast_runtime":"ready"` (spacing may differ). Then open **Demand planning → Check sales history again**. A working Python installation can still report insufficient history. The existing 27 demand observations do not currently qualify any part for a current forecast; the 23-row import alone cannot fix that. More recent actual part-level sale dates and quantities are needed. Measure forecast error on later held-out actual sales and compare it with a simple baseline; a database reset cannot guarantee lower WAPE.

Only after reconciliation and these checks should all staff use the replacement. Keep the old project/private backup for your chosen retention period. No production reset or project creation is performed by downloading these files.

## Maintainer validation

Regenerate with `node scripts/build-supabase-fresh-start.mjs`. The ZIP derives both installation files from `supabase/paste-ready`; Part 1 receives the fresh-only guard inside its transaction. Run `node --test tests/fresh-start-sql.test.js tests/paste-sql.test.js` from `apps/server` after regeneration. These local PostgreSQL checks do not replace testing hosted Supabase, Gmail, Render deployments or actual-data forecast validation.
