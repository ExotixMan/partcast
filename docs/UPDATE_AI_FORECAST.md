# PartCast AI + Forecast Update

## 1. Upgrade an existing Supabase database

Open Supabase > SQL Editor and run:

`supabase/migrations/0003_training_import.sql`

This adds `imported_training_data` as a valid demand-observation source and `demand_training` as a valid import batch type.

## 2. Redeploy to Render

Push the updated project to the same private GitHub repository. Render can deploy the root `render.yaml` Blueprint.

API environment variables required:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGINS`
- `SETUP_SECRET`
- `CRON_SECRET`
- `IP_HASH_SECRET`
- `BREVO_API_KEY` (optional until supplier email is enabled)
- `BREVO_SENDER_EMAIL` (optional until supplier email is enabled)
- `GEMINI_API_KEY` (optional; Smart Local chatbot works without it)
- `GEMINI_MODEL=gemini-2.5-flash`

Frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL=https://YOUR-API.onrender.com`

API CORS:

- `FRONTEND_ORIGINS=https://YOUR-WEB.onrender.com`

## 3. Import the supplied datasets

Open PartCast > Import Data and use **Auto detect from columns**.

Recommended order:

1. `Inventory-npg_CLEAN_FOR_PARTCAST(1).xlsx`
2. `CUST-REF-TRANS_CLEAN_FOR_PARTCAST(1).xlsx`
3. `PartCast_XGBoost_TRAINING_READY(1).xlsx`

PartCast does not require those exact names. Renaming any file is allowed. It identifies the structure from column headers.

For the training-ready workbook, PartCast selects the strongest usable table containing Date + Part Number + Demand Quantity. With the supplied workbook this is designed to favor the Tier-B usable data rather than lower-confidence proxy-only data.

## 4. Verify forecasting

Open **Demand Forecast**.

You should see a non-zero **Imported training rows** count. Click **Train & Forecast**. A successful run will:

- create a completed XGBoost model run;
- show MAE, RMSE, R², WAPE, and bias when available;
- show the number of forecasted products;
- automatically select a forecasted product;
- draw its future demand line chart;
- feed forecast totals into reorder recommendations.

## 5. Verify chatbot

Click **PartCast Assistant** at the bottom-right.

Try:

- `Which parts are low stock?`
- `What should we reorder?`
- `Is the XGBoost forecast ready?`
- `How much training data do we have?`
- `How many units of 17801-0C010 are available?`

The chatbot works without a paid AI API. If `GEMINI_API_KEY` is configured, it uses Gemini for natural-language answers while still grounding responses in live PartCast data.
