# PartCast Verification Report

## Source checks completed

- All Node.js backend source files passed `node --check` syntax validation.
- `ml/train_forecast.py` passed Python bytecode compilation.
- `render.yaml` parsed successfully and contains the Docker API plus static React web service.
- The distributable package contains no `.env` files, raw `.xlsx`/`.csv` datasets, `node_modules`, or Python cache files.

## Supplied XGBoost dataset test

The improved XGBoost script was executed locally using the uploaded training-ready workbook's **Daily_B_Usable** observations.

Input used for the test:

- 411 dated demand observations
- 22 product part numbers
- 30-day forecast horizon

Successful result:

- 22 products passed forecast eligibility
- 660 future forecast rows were generated (22 products x 30 days)
- MAE: 0.0024
- RMSE: 0.0541
- R²: 0.7766
- MAPE: 17.6638%
- WAPE: 24.2197%
- Bias: -0.0019

This verifies that the Python/XGBoost forecasting pipeline executes end-to-end on the supplied training-ready data. Final production metrics can differ after Supabase product matching, additional real sales, or future data changes.

## Training workbook selection test

The smart training importer scores candidate tables using their actual columns and Tier distribution rather than requiring a specific file name.

For the supplied training-ready workbook, the selection scores were:

- Daily_B_Usable: 1200.0
- Daily_BC_Expanded: 673.23
- Daily_Inferred_Only: 200.0
- Daily_Hybrid_All: 200.0

Therefore the importer selects the Tier-B usable table by data quality, not by the uploaded file name.

## Deployment smoke test after Supabase/Render redeploy

1. Open API `/health` and confirm `ok: true`.
2. Sign in to PartCast.
3. Open Import Data and upload the clean inventory spreadsheet.
4. Upload the clean customer/reference spreadsheet.
5. Upload the XGBoost training-ready spreadsheet.
6. Confirm **Imported training rows** is greater than zero on Demand Forecast.
7. Click **Train & Forecast**.
8. Confirm a completed model run appears, forecasted products are listed, and a line chart is shown.
9. Open PartCast Assistant and ask `Is the XGBoost forecast ready?`.
10. If Gemini is enabled, confirm the chat header says Gemini-assisted; otherwise Smart Local mode is expected and fully usable.
