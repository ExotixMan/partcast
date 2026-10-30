# Search suggestions and live planning updates

This change is based on production commit 43fc797. It preserves the current
verified login, role access, offline queue, sales basket, delivery limits, photos,
customer balances, forecasting readiness and separate demo workflows.

Apply `supabase/migrations/0013_realtime.sql`, followed by
`supabase/migrations/0014_automatic_forecasts.sql`, after existing migrations through
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
future deliveries and bottoms out at zero. Stock-in is not demand. XGBoost predictions now retrain automatically after saved
sales, synced offline sales and imported demand. The manual training button has
been removed. Existing forecasting readiness checks and separate demo data mode
remain in place.

## Automatic XGBoost updates

A database trigger queues committed demand changes in the same transaction as
sales. Rolled-back sales cannot queue a model update. A durable singleton row
coalesces closely spaced requests (2-second debounce, capped at 5 seconds). The API
starts a background worker at server startup and checks for queued work every
2 seconds. No page visit, browser timer, admin session or manual action is needed
for training. Sale responses do not wait for Python.

The worker claims a database lease before starting. A sale during training retains
a later request version and causes a follow-up calculation. Only the worker that
still owns its unexpired lease may publish a completed run. Completed predictions
and queue state are published atomically; interrupted workers cannot overwrite
newer models. Leases recover after a server restart. Errors retain pending work
with retry backoff from 5 seconds to 5 minutes. Insufficient history waits until
more sales arrive, without manufacturing training data or discarding an existing
completed model. A new store day also queues a refresh as the server wakes.

Training still needs the forecasting engine's existing data requirements (including
sufficient sale days and recent history). It is automatic, not instantaneous: the
last completed predictions remain visible while XGBoost calculates. New values
appear as soon as the completed run is published. Restocking updates stock and
projection immediately; it does not count as customer demand.

Changing the planning period automatically queues a new calculation. Managers can
change the horizon; recording a sale as a cashier needs no training privileges.
Only the server's service role can claim or finish jobs. Authenticated store staff
can read status, subject to existing role and row-level access rules.

Open planning tabs subscribe to the queue and completed-run changes. While work is
pending, a 2-second status check also catches completion when WebSocket delivery
is interrupted. Idle tabs check status every 15 seconds, with an immediate refresh
on focus/reconnection. This fallback reloads forecasts when a new completed run
appears, without refreshing the page. Queued/training/history/retry messages are
available in English and Tagalog. Browser polling never initiates training.

Checks from the repository root:

```bash
node tests/live-data.test.mjs
node apps/server/tests/realtime.test.js
node apps/server/tests/automatic-forecasts.test.js
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


Automatic forecasting validation includes PostgreSQL sale/rollback triggers,
coalescing, competing claims, sales during training, expired-worker fencing,
retry backoff, horizon/day changes and migration repeatability. The real Python
readiness/model tests still verify eligible sparse history and demo-source
isolation. Browser tests verify that a sale changes both prediction graph values
and the daily list in a second tab, with no manual training request. Hosted worker
and Realtime delivery remain unverified until both migrations are applied and the
updated API and web services are deployed.

Automatic-update checks passed: 181 backend tests, the website unit suite and
translation coverage, PostgreSQL queue/lease/migration checks, fresh-install and
upgrade checks, real XGBoost readiness/demo runs, and seven targeted Chromium
scenarios across the initial run and corrected assertion rechecks. The browser
sale test verifies changed XGBoost prediction values and daily rows in another tab
without sending a manual training request.
