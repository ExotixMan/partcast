# PartCast

Demand forecasting and inventory management for NPG Auto Parts. The application uses React, Node.js/Express, Supabase and Python/XGBoost. The release branch is **production**.

Inventory manages part details and stock corrections. Sell or receive records multi-part baskets. Sales shows transaction history. Customer utang tracks balances and partial payments. Restock supports small purchase suggestions, supplier filters and reviewed Gmail requests with editable tables. The application also supports private photos, barcode lookup, English/Tagalog, dark mode, date-range exports, and queued offline stock operations.

## Upgrade an existing store

Apply only missing migrations, in order. A store already through 0011 needs [0012_sale_financial_integrity.sql](supabase/migrations/0012_sale_financial_integrity.sql). It enforces sale quantities, rounded totals and credit due dates without rewriting old sales. Back up the store and apply the migration before deploying both services from `production`. Run migration 0006 and 0007 in separate committed executions if upgrading an older store.

For a fresh installation or recognized-schema upgrade, use the [complete two-part SQL installer](supabase/paste-ready/README.md). The application does not require resetting or reimporting existing stock for this release.

## Develop locally

Use Node 20.19 or newer and Python 3.11 or newer. Install both applications with `npm ci` in `apps/server` and `apps/web`. Create a Python virtual environment at the repository root and install `ml/requirements.txt`. Copy each application's `.env.example` to `.env` and enter matching Supabase credentials privately. Configure Gmail on the API for password-followed-by-email-code sign-in. Server secrets must never enter a `VITE_` variable.

Run `npm run dev` in each application directory. The website opens at `http://localhost:5173`; the API defaults to port 10000. For this cloud workspace, `bash scripts/cloud-setup.sh` installs dependencies and runs local checks; it does not import store data.

## Validate

- Server: `npm test` in `apps/server`.
- Website: `npm test` and `npm run build` in `apps/web`.
- Browser workflows: build the website with test connection settings, then `npm run test:e2e` in `apps/web`.
- Forecasting: `.venv/bin/python -m unittest discover -s ml -p 'test_*.py'` at the repository root.

Browser tests use isolated mocked store records. PostgreSQL tests execute the schema and permission rules locally. Neither establishes hosted Gmail delivery or forecast accuracy on actual store sales.

## Maintainer guides

[Deployment](docs/DEPLOYMENT.md) · [Security](docs/SECURITY.md) · [Store workflows](docs/STORE_WORKFLOWS.md) · [Offline use](docs/OFFLINE_AND_SETUP.md) · [Forecasting data](docs/FORECASTING_DATA.md) · [Verification](docs/VERIFICATION.md) · [QA checklist](docs/QA_CHECKLIST.md) · [Design references](docs/DESIGN_REFERENCES.md) · [API](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Capstone scope](docs/CAPSTONE_SCOPE.md).

Raw uploads, exported datasets, old preparation packs and historical review documents are delivered separately in the private data archive. They are excluded from the current source tree. The labelled example workbook and simulated database fixture remain for the separate forecasting exercise and automated tests. Generated sales must never be relabelled as real transactions. Removing files from the current tree does not erase older Git commits.
