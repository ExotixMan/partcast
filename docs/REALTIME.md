# Search suggestions and live planning updates

This change is based on production commit 43fc797. It preserves the current
verified login, role access, offline queue, sales basket, delivery limits, photos,
customer balances, forecasting readiness and separate demo workflows.

Apply `supabase/migrations/0013_realtime.sql` after existing migrations through
0012, then deploy the API and website from `production`. Do not apply the older
main-branch `0004_realtime.sql` to this release. The new migration adds database
change notifications while preserving existing publication members and RLS. It is
safe to rerun. The migration was tested against PostgreSQL through PGlite.

Inventory, Sell/Receive and the home search suggest matching parts after the first
letter or number, including barcodes and saved aliases through the existing search
API. Demand planning offers a matching list from the first character. Use the arrow
keys and Enter, or click/tap a suggestion. Older requests cannot overwrite newer
suggestion results. Suggestions work with saved inventory when offline.

Signed-in tabs listen for authorized Supabase database changes. Successful API
writes notify local views and other same-origin tabs for the same user. Offline
transactions retain their existing retry and validation rules; committed syncs also
refresh views after the offline snapshot has been updated. Views refresh on focus,
reconnection and visible-tab recovery every 60 seconds if database notifications
are temporarily unavailable. Cross-browser/device updates require the migration.

Demand planning lists all active parts, including new products without a trained
prediction. It displays current stock, actual sales over the last 30 store days,
the latest model predictions and a projected-stock line. Restocking raises the
projection and sales lower it, without requiring reload. Projection assumes no
future deliveries and bottoms out at zero. Stock-in is not demand; model predictions
still change when the owner updates demand estimates. The existing forecasting
readiness checks and separate demo data mode remain in place.

Checks from the repository root:

```bash
node tests/live-data.test.mjs
node apps/server/tests/realtime.test.js
(cd apps/web && npm test && npm run build)
(cd apps/server && npm test)
```

The browser suite `apps/web/tests/e2e/live-updates.spec.js` uses mocked API/auth
responses to verify suggestions, keyboard selection, two-tab delivery and sale
updates, the planning graph, dashboard graph, return navigation and mobile layout.
Run it with the repository's Playwright configuration and documented test build
variables. It does not write to the hosted store. Real hosted delivery must be
checked after applying the migration and deploying both services.

Validation for this release: the production build, seven live-data regression
checks, PostgreSQL publication/idempotency check, website unit suite and the
forecast HTTP contract checks passed. The new production two-tab browser scenario
passed for suggestions, deliveries, sales, planning and overview graphs, return
navigation and mobile layout. The selected existing browser suites passed 38 cases
on their initial run; corrected combobox/home-search and two-tab cases passed on
recheck. Photo-layout races and the older excessive-quantity assertion also fail
on unchanged production commit 43fc797 and are not claimed as passing here.
