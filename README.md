# PartCast

**PartCast: A Demand Forecasting Inventory Management System for NPG Autoparts Using XGBoost Regression**

Full-stack capstone system using React + Tailwind CSS, Node.js/Express, Supabase, Python/XGBoost, Excel backups, supplier email automation, and an AI-assisted inventory chatbot.

## New in this build

- Guided multi-part sales/deliveries and customer-only utang with partial payments.
- Categories, alternate names, private product photos, and camera/manual barcode search.
- English/Tagalog interface, Tagalog part terminology, light default and optional dark mode.
- Editable supplier email drafts and date/category-filtered Excel inventory and sales reports.
- Required password followed by a Gmail email code, Super Admin/Owner/Cashier permissions, and encrypted Google API settings.
- Header/mobile-help PartCast chatbot that keeps pagination clear.
- Works immediately in **Smart Local** mode using live PartCast database facts.
- Optional **Gemini-assisted** mode using `GEMINI_API_KEY`; only minimized inventory/forecast context is sent, not passwords, customer names, or supplier email addresses.
- Smart spreadsheet import accepts files with **any base file name** in `.xlsx`, `.xlsm`, or `.csv` format.
- Auto-detects inventory, historical sales, and demand-training spreadsheets by column structure.
- Multiple spreadsheets can be selected and imported sequentially.
- Direct importer for the supplied `PartCast_XGBoost_TRAINING_READY` workbook.
- XGBoost training now automatically includes imported training observations plus real PartCast sales.
- Improved intermittent-demand feature engineering for sparse automotive spare-parts demand.
- Forecast page shows exactly which products were forecast and automatically opens a forecasted product.
- Added missing Render `Dockerfile` and `render.yaml`.

## Required database upgrade for an existing Supabase project

Apply only unapplied migrations. Existing installations with 0001–0005 need `0006_access_roles.sql` followed by `0007_verified_login_and_access.sql` in separate executions. Fresh projects need all seven in order:

1. `0001_schema.sql`
2. `0002_rls.sql`
3. `0003_training_import.sql`
4. `0004_offline_security_notifications.sql`
5. `0005_store_workflows.sql`
6. `0006_access_roles.sql` (separate execution; commit before step 7)
7. `0007_verified_login_and_access.sql`

See [Activate and use the new features](docs/STORE_WORKFLOWS.md) for everyday sales/utang workflows and validation limits. See [Required login, roles, Google API setup and Python repair](docs/LOGIN_ROLES_FORECASTING.md) before deploying; configure Gmail first and apply 0006 separately before 0007.

For complete files to copy into Supabase SQL Editor, use [Paste-ready SQL and API settings](supabase/paste-ready/README.md). Run the two main files separately, in order. They support fresh and recognized existing PartCast databases and preserve store records; business-table access pauses between the two executions.

## Recommended dataset import order

1. Clean inventory spreadsheet
2. Reviewed customer/reference transactions spreadsheet for invoice history
3. Reviewed actual-quantity training workbook prepared from the raw receipts
4. Go to **Demand planning** and click **Update demand estimate** once recent history meets the eligibility checks

See [Forecasting data preparation](docs/FORECASTING_DATA.md). The original training-ready workbook contains inferred/proxy quantities; its older metrics do not establish current forecast accuracy.

The file name itself is not used to decide the dataset type. Auto detection uses the table headers.

## Local development

Backend:

```bash
cd apps/server
cp .env.example .env
npm ci
npm run dev
```

ML environment from project root:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r ml/requirements.txt
```

Frontend:

```bash
cd apps/web
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5173`.

## AI assistant

Without a Gemini key, the chatbot still works in Smart Local mode and answers live inventory, low-stock, reorder, forecast-status, and data-quality questions.

To enable Gemini-assisted answers, set on the **Render API service only**:

```text
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
```

Never put `GEMINI_API_KEY` in the React/Vite environment.


## Offline-first update

See [Offline use and setup](docs/OFFLINE_AND_SETUP.md) for installation, secure configuration, migrations, data import order, testing, and limitations. Apply unapplied migrations through `0007_verified_login_and_access.sql` before starting this version.

See [Light interface and everyday workflows](docs/USABILITY_REDESIGN.md) for the responsive redesign, guided stock forms, accessible navigation, and usability checks.

This version adds an installable PWA, saved inventory and duplicate-safe stock movement sync, readable mobile stock controls, in-app stock notifications and automatic supplier checks. The assistant uses local help, then live store records, then optional AI. Forecast evaluation now excludes same-day demand leakage and compares against a simple baseline; the supplied data does not establish reliable forecast accuracy.

See [Preparing actual forecasting data](docs/FORECASTING_DATA.md) for joining raw inventory quantities to sales invoices, producing cleaned workbooks with row provenance, and comparing historical 30-day forecasts. Current forecasting rejects future dates and stale eligible history rather than assuming unrecorded days had zero sales.

For a Render “Failed to fetch” error, see [Render connection settings](docs/RENDER_CONNECTION.md) for the exact website/API addresses, matching Supabase keys, and rebuild checks.
