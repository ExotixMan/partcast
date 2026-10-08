# PartCast

**PartCast: A Demand Forecasting Inventory Management System for NPG Autoparts Using XGBoost Regression**

Full-stack capstone system using React + Tailwind CSS, Node.js/Express, Supabase, Python/XGBoost, Excel backups, supplier email automation, and an AI-assisted inventory chatbot.

## New in this build

- AI-assisted floating PartCast chatbot on desktop, tablet, and mobile.
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

Run this in Supabase SQL Editor after your original migrations:

`supabase/migrations/0003_training_import.sql`

For a fresh Supabase project, run migrations in order:

1. `0001_schema.sql`
2. `0002_rls.sql`
3. `0003_training_import.sql`

## Recommended dataset import order

1. Clean inventory spreadsheet
2. Clean customer/reference transactions spreadsheet
3. XGBoost training-ready spreadsheet
4. Go to **Demand Forecast** and click **Train & Forecast**

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

See [Offline use and setup](docs/OFFLINE_AND_SETUP.md) for installation, secure configuration, migrations, data import order, testing, and limitations. Apply `supabase/migrations/0004_offline_security_notifications.sql` after the original migrations before starting this version.

This version adds an installable PWA, saved inventory and duplicate-safe stock movement sync, readable mobile stock controls, in-app stock notifications and automatic supplier checks. The assistant uses local help, then live store records, then optional AI. Forecast evaluation now excludes same-day demand leakage and compares against a simple baseline; the supplied data does not establish reliable forecast accuracy.

See [Preparing actual forecasting data](docs/FORECASTING_DATA.md) for joining raw inventory quantities to sales invoices, producing cleaned workbooks with row provenance, and comparing historical 30-day forecasts. Current forecasting rejects future dates and stale eligible history rather than assuming unrecorded days had zero sales.

For a Render “Failed to fetch” error, see [Render connection settings](docs/RENDER_CONNECTION.md) for the exact website/API addresses, matching Supabase keys, and rebuild checks.
