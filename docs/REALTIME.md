# Live updates and search

Inventory and Demand Forecast show suggestions after the first non-whitespace
letter or number. Search matches part number, description, or brand without case
sensitivity. Inventory suggestions search the full catalog using the active stock
filter, rather than just the visible page. Choose a suggestion with a click/tap or
Arrow keys and Enter; Escape closes the list. Rapid searches cancel old requests
so late responses cannot replace the current results.

## Live data

Run `supabase/migrations/0004_realtime.sql` on the intended Supabase project after
the earlier migrations, then deploy both API and web changes together. The migration
is safe to rerun and adds the relevant tables to `supabase_realtime`. Existing
authenticated SELECT and row-level security policies remain in force. It does not
enable anonymous access or publish secret credentials.

Each signed-in tab opens one Supabase Postgres Changes subscription. Successful
API writes also invalidate local views and notify other same-origin tabs for the
same user through BroadcastChannel, with a storage-event fallback. Messages carry
table names only; views fetch their data again through the authenticated API.
This updates inventory, transactions, dashboard graphs, Demand Forecast,
replenishment, import history, staff/audit lists, and backup history. Background
updates preserve the visible page, current filters and selected product.

Database notifications support changes made by other users, other browsers,
imports, and scheduled forecast jobs. Related notifications are debounced to avoid
refreshing once for every row of an import. Reconnection, window focus and returning
to a visible tab fetch fresh data. A 60-second refresh for visible tabs recovers
missed notifications when Realtime is unavailable; this fallback is not instant.

## Demand planning graph

- **Actual sales** shows recorded sale quantities over the last 30 days, updating
  as sales are recorded.
- **Projected stock** starts at live on-hand stock and subtracts the latest
  predicted demand. Restocking raises it; sales and stock-out lower it. Projection
  assumes no future deliveries and bottoms out at zero.
- **Predicted demand** comes from the latest completed XGBoost training run.
  Stock-in does not count as demand. Retraining remains an explicit
  **Train & Forecast** action; editing inventory does not silently change model
  predictions. When another tab or a scheduled job completes training, the chart
  automatically loads the new run.

New active products appear in planning search immediately, including products
without enough history for a trained prediction. Their stock and actual sales
remain visible. Every chart uses a single completed run to avoid mixing forecasts
from different model versions.

## Verification

From the repository root:

```bash
node tests/live-data.test.mjs
(cd apps/web && npm run build)
node --check apps/server/src/routes/api.js
```

The unit suite covers event routing, cross-tab notification loops, storage fallback,
reconnection and cleanup, stock/sales chart calculations, missing models, and
single-run database queries.

With Playwright available to Node and Chromium installed:

```bash
node tests/realtime-browser.cjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if a custom browser path is required. The
browser test starts its own Vite instance on port 5180 and uses mocked auth and API
responses. It checks single-character/numeric suggestions, keyboard selection,
out-of-order searches, stock-in and sale graph updates across two tabs, new-product
discovery, dashboard graphs, return navigation and mobile layout. It never writes
to a hosted database.

For deployment verification, sign in to the configured project in two browsers
or sessions, open Inventory in one and Demand Forecast in the other, select the
same product, then record stock-in and a sale. Confirm live stock, the green
projection and blue actual-sales lines update without reload. Repeat with the
Dashboard sales graph and a newly added product. This verifies hosted database
notifications beyond the local cross-tab path.
