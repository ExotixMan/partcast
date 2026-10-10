# PartCast: offline use and setup

PartCast remains React/Vite, Express, Supabase and Python/XGBoost. No second frontend framework is needed. The UI uses solid colors, descriptive actions, numbered instructions, stock-change previews, and large mobile controls.

## Connect the store

1. In Supabase, apply migrations 0001–0003 for a fresh project, then `0004_offline_security_notifications.sql` and `0005_store_workflows.sql`. For an existing database, apply only unapplied migrations. Back up existing data before migrating. Migration 0004 enables duplicate-safe offline movements, active-account reads, notifications and job leases. Migration 0005 adds basket sales, customer utang, categories, barcodes and private part photos. See [new feature activation](STORE_WORKFLOWS.md) for email-code login and deployment.
2. Server environment: `SUPABASE_URL=https://ragdjkdcrvexqfadlqbf.supabase.co`, public `SUPABASE_ANON_KEY`, secret `SUPABASE_SERVICE_ROLE_KEY`, unique random `SETUP_SECRET`, `CRON_SECRET` and `IP_HASH_SECRET`. Keep service keys on the server. Create an ignored server `.env` or use your hosting environment settings. Preserve existing secrets; they are intentionally absent from GitHub.
3. Frontend environment: matching `VITE_SUPABASE_URL`, public `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL`. Rebuild after changing frontend variables. Never put service keys, email keys or AI keys in `VITE_` variables.
4. Allow the Supabase project hostname in cloud network settings. For optional email/AI, allow `api.brevo.com` / `generativelanguage.googleapis.com`. Use HTTPS for the deployed web app and API; set exact `FRONTEND_ORIGINS`. HTTP localhost is sufficient for development tests.
5. Disable public Supabase signups. Bootstrap the owner once using the setup form and server secret, then create staff accounts as owner. Bootstrap requests are rate limited and protected by a database lease.

Install:

The reusable cloud setup script installs dependencies, generates local bootstrap secrets only when no server `.env` exists, and runs checks. Set Supabase keys separately in environment settings:

```sh
bash scripts/cloud-setup.sh
```

For manual installation:

```sh
cd /workspace/partcast/apps/server
npm ci
cd ../web
npm ci
cd ../..
python -m venv .venv
.venv/bin/pip install -r ml/requirements.txt
```

Start separate managed processes:

```sh
cd /workspace/partcast/apps/server
PYTHON_BIN=/workspace/partcast/.venv/bin/python npm run dev
# Separate terminal:
cd /workspace/partcast/apps/web
npm run dev
```

For offline/PWA testing, build and preview instead of using Vite dev:

```sh
cd /workspace/partcast/apps/web
npm run build
npm run preview
```

Check API `/health`, database-backed `/setup/status`, sign in, open Inventory, and wait for “Inventory saved”. A health response alone does not prove database access.

## Import the supplied data

Use Import Data as owner/admin. Review the raw-workbook preparation instructions in [FORECASTING_DATA.md](FORECASTING_DATA.md). Import reviewed inventory first, then reviewed legacy invoices and actual-quantity training data. The original `PartCast_XGBoost_TRAINING_READY.xlsx` includes inferred/proxy quantities and does not establish actual unit demand; the newer preparation produces `PartCast_Actual_Quantity_Training.xlsx` with row provenance and coverage warnings. Existing importers recognize spreadsheet headers and prefer `Daily_B_Usable`. Review unmatched products and warnings. Keep legacy quantity proxies disabled unless intentionally needed for a clearly labeled demonstration. Uploaded customer files remain outside the source checkout and must not be committed. No data was imported into the live Supabase project during implementation.

## Offline workflow

Sign in online first. Account-scoped IndexedDB stores verified profile information, the active product list, supplier IDs/names and selected previously viewed screens for up to 12 hours. Cached summaries show their age. Offline, view saved inventory and record sales, received stock and removed stock. Product edits, creating products, imports, reports, account management, training and supplier email require internet.

Stock movements enter a durable outbox with a unique operation UUID and original timestamp. While the app is open, reconnecting automatically replays them in order, and a retry every five seconds while movements are pending covers interruptions. A database transaction commits the stock change, demand observation and sync receipt together. Repeating a UUID/payload returns the original transaction without deducting stock again; changing its payload is rejected. Row locks stop two devices from overselling. An insufficient-stock or invalid-data response pauses the queue and remains visible for review. Remove a rejected change and record a corrected one rather than silently changing its quantity. Transport failures and expired sessions retain pending work.

Offline stocks include pending changes; dashboard summaries update after successful synchronization. Sign-out clears the account's local data and warns before discarding unsent changes. New accounts cannot access another account's cache through app flows. The public service worker caches only application assets, never private API responses. Browser/device storage is not encrypted by the application: use a protected device, avoid shared browser profiles, and sync before clearing browser data or signing out. Account revocation requires connectivity; cached offline access is bounded to 12 hours. Local state is never authority for server permissions.

The app must be opened again after it is closed to resume syncing. This implementation does not promise background sync while the app/browser is closed. Keeping the app open until “Connected” with no unsent transactions confirms delivery.

## Installation and updates

Visit the HTTPS site once online. Chrome/Edge offer Install app; on iPhone/iPad use Safari → Share → Add to Home Screen. Desktop, tablet and mobile use the same application. App updates show a prompt; sync pending movements before updating. All built app chunks are precached for offline navigation.

## Chatbot

Local instructions and simple help run on the device. Offline inventory answers use saved records and explicitly show when they were saved. Connected business questions use deterministic live database answers first. Gemini is the final optional fallback for questions those rules cannot answer. AI receives limited store context and no customer names or supplier email fields; it cannot mutate inventory. Responses label their source. AI output must be checked before business decisions.

## Stock alerts and email

Database triggers create low-stock/out-of-stock alerts, resolve them after replenishment, and avoid duplicate active alerts per part. The bell shows active alerts with account-specific read markers and links to restocking; it polls while open/online. These are in-app notifications, not operating-system push notifications.

To enable automatic supplier requests, configure `BREVO_API_KEY` and a verified `BREVO_SENDER_EMAIL`, assign product suppliers and email addresses, and enable Automatic supplier email in Settings. The server checks every minute while running; `/jobs/supplier-email` and the daily scheduled job provide external triggers. A database lease prevents overlapping automatic checks. A supplier cooldown suppresses repeated requests even if recommended quantities change. Each pass handles at most ten suppliers and later passes continue others. Provider requests time out after 20 seconds and outcomes are logged. Email is a supply request, not a purchase order. Delivery exactly once cannot be guaranteed across a crash between provider acceptance and log persistence. No real supplier messages were sent during testing.

## Forecast interpretation

Demand features use only earlier observations. Removed the previous same-day event-age leakage and matched rolling standard deviations between training and prediction. Evaluation splits chronologically and includes a simple recent-demand baseline, date range, MAE, RMSE and WAPE. Metrics are next-day holdout results, not guaranteed accuracy over a 30/60/90-day recursive forecast. Model execution is limited to 120 seconds and two XGBoost threads.

An earlier historical diagnostic of the original `Daily_B_Usable` workbook used 411 inferred/proxy observations and 22 eligible products. Corrected holdout MAE was approximately 0.0177 versus baseline 0.0166; R² was negative. Those results do not establish actual unit-demand accuracy. The raw-workbook review recovered 759 accepted actual-quantity lines, but only two parts meet the minimum history requirement and both have old histories. Current training excludes eligible products with no usable sale record in the last 31 days and rejects future dates; it intentionally refuses to create current forecasts from this stale history. Positive days now use equal weights, and short unobserved gaps are estimated internally instead of becoming fabricated zero-sales observations. Internal missing dates still require a verified coverage assumption. Collect complete recent sales and use rolling 30-day holdouts before relying on recommendations. The UI shows coverage concerns and cautions when the model does not improve on the baseline.

## Validation

```sh
cd /workspace/partcast/apps/server && npm test
cd /workspace/partcast/apps/web && npm test && npm run build && npm run test:e2e
cd /workspace/partcast && .venv/bin/python -m unittest discover -s ml -p 'test_*.py'
```

Database tests use actual PostgreSQL via PGlite with Supabase auth/storage scaffolding, exercising all five migrations, inactive accounts, duplicate receipts, stock conflicts, direct-write denials, alert transitions and email leases. Browser tests use Chromium with mocked API/auth responses, verify responsive flows, offline reload, outbox persistence/reconnect and sign-out cleanup. They are not evidence of a connection to your hosted database or real email/AI delivery.

The Figma URL could not be read due to environment network restrictions. This is an independently implemented simple layout, not a verified exact reproduction of those frames. Exported frames can be used for a later visual comparison.

Spreadsheet uploads now use ExcelJS with XML namespace/relationship normalization, retaining compatibility with all three supplied workbooks. ZIP expansion, upload size and worksheet counts are bounded; CSV retains leading-zero part numbers. SheetJS was removed, supported dependency fixes applied, and Tailwind upgraded to its current build integration. Dependency audits are point-in-time package checks, not a comprehensive security certification.
