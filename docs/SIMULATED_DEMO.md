# PartCast simulated training exercise

This package uses **existing inventory part identifiers, descriptions, brands and units**, with **entirely simulated dates and demand quantities**. It is useful for learning, training experiments and demonstrating the software on your own computer. Its scores describe generated scenarios; they do not establish forecasting accuracy on actual store sales.

## Open the prepared files

1. Extract `SIMULATED_PartCast_Demo.zip` to a folder on your computer.
2. Open `SIMULATED_Report.html` in your browser. It works without an internet connection and shows every demand pattern, the measured errors and the simple-method comparisons.
3. Open `SIMULATED_PartCast_Demand.xlsx` to inspect the existing catalog items, generated demand, held-out test periods and future estimates.

You do not need Python, Supabase or an API key just to open the report and Excel workbook. To train again, use the scripts in the PartCast repository and its installed Node/Python dependencies.

For a new repository clone, the standalone exercise needs Node >=20.19, the server's locked dependencies (`npm --prefix apps/server ci --omit=dev`) and a Python virtual environment with `ml/requirements.txt`. On Windows, create it with `py -m venv .venv` and install with `.venv\Scripts\python.exe -m pip install -r ml/requirements.txt`. On Linux/macOS, use `python3 -m venv .venv` and `.venv/bin/python -m pip install -r ml/requirements.txt`. Preserve an existing working environment. The web application and database do not need to start.

## Generate and train another experiment

From the PartCast repository root, after the normal project dependency setup:

```bash
node scripts/create-simulated-demo.mjs \
  --inventory /path/to/Inventory_Cleaned.xlsx \
  --out /path/to/new-empty-simulated-folder \
  --as-of 2026-10-15 \
  --days 730 --parts 24 --seed 20261015
```

Use an existing inventory workbook containing an `Inventory` worksheet with `Part Number` and `Description` headers. The workbook is read only. Choose a new empty output folder each time; the tool refuses to overwrite existing files. On Windows, use your Windows file paths and run the command on one line. An optional `--python /path/to/python` selects a runtime; the script otherwise probes the configured runtime, local `.venv` and PATH. No database credentials are needed.

You can also recreate the prepared exercise using only the selected catalog included in the ZIP, without the full private inventory workbook:

```bash
node scripts/create-simulated-demo.mjs \
  --catalog /path/to/SIMULATED_Catalog_Input.json \
  --out /path/to/another-empty-simulated-folder \
  --as-of 2026-10-15 --days 730 --parts 24 --seed 20261015
```

That input contains only the 24 selected identities. Use at most 24 parts when recreating from it. The source hash will identify the catalog JSON rather than the original Excel file, while generated demand and forecasts remain reproducible.

The date is an explicit **simulation** date. A different simulation date generates a different calendar; this never changes dates on actual invoices. Supported sizes are 180–1095 days and 4–48 existing parts. A fixed seed makes generation reproducible with the same catalog, date and software versions. Do not select seeds by repeatedly checking which gives the most favorable test score.

## What the model learns and how it is tested

The default exercise chooses 24 unambiguous existing SKUs by a deterministic hash, independently of forecast results. Conflicting duplicate catalog identities are excluded. It generates a complete 730-day calendar per part, including explicit zero-demand days. A zero in this calendar is a known generated outcome, unlike an unknown missing day in partial actual sales records.

Four declared scenarios are assigned evenly: steady Poisson demand; weekly/annual variation; intermittent demand with a 22% daily event probability; and a persistent increase in demand after 65% of the simulated history. These rates and patterns are **assumptions**, not measured store behavior. Catalog units are preserved as written; blank units remain unspecified, and no pack or liquid conversions are inferred. Generated counts should be interpreted only within that hypothetical base unit.

The generator makes one dataset using the requested seed. It does not alter records, search seeds, change distributions or tune XGBoost parameters to reach a target score. It compares the existing recursive forecast with a separate **direct 30-day XGBoost experiment**. Both reuse the current XGBoost parameters and feature definitions. The final 30 days stay out of their fitted training labels. Each complete 30-day part total is predicted using earlier history only.

The direct model learns the sum of the next 30 days, rather than repeatedly predicting a day and feeding that estimate into later inputs. Every training target must end within history available at that training origin. Earlier rolling development periods choose between the two XGBoost strategies; the choice does not read final-period scores. The initial recursive test was inspected during development, so the reported comparisons are **exploratory**, not a fresh independent accuracy test. No real-store accuracy is established.

The report includes MAE, RMSE, WAPE, actual generated totals and predicted totals, along with recent-average, Croston-SBA and TSB references. It reports all four scenarios, including poor ones. A smaller aggregate WAPE can hide weak intermittent-demand performance, so read the per-scenario results too. WAPE is percentage error; do not label `100 − WAPE` as model accuracy.

WAPE across parts weights higher-volume generated counts more heavily. Catalog base units can differ or be unspecified; inspect the individual part-periods and scenario errors as well as the combined number.

After evaluation, **separate delivery models** for both strategies are fitted on all generated history and used to estimate the next 30 days. Their files are labelled in filenames and embedded XGBoost attributes as `SIMULATED_DEMO`. The part-code mapping and feature columns are saved in results. Future estimates have no observed outcomes yet and are not the held-out evaluation. The direct model's daily export divides its predicted total evenly across 30 days; those rows do not establish daily sale timing.

## Package contents

- `SIMULATED_PartCast_Demand.xlsx`: labelled worksheets for the catalog, daily generated demand, held-out test periods and future forecasts.
- `SIMULATED_Demand.csv` and `SIMULATED_Catalog.csv`: generated observations and the selected existing catalog identities. CSV text is protected against spreadsheet formula interpretation.
- `SIMULATED_Catalog_Input.json`: the selected catalog, for recreating this exercise without a full inventory workbook.
- `SIMULATED_Training_Input.json`: labelled simulated observations in the Python engine's payload shape.
- `SIMULATED_XGBoost_Model.json`: a model trained entirely on generated demand; not a validated store model.
- `SIMULATED_Direct_XGBoost_Model.json`: the direct 30-day XGBoost model; also labelled as a simulation experiment in its embedded attributes.
- `SIMULATED_Future_Forecasts.csv`: estimates from the delivery model, with every row labelled simulated.
- `SIMULATED_Direct_Future_Forecasts.csv`: an even daily allocation of the direct model's predicted period total.
- `SIMULATED_Results.json`: assumptions, seed, complete test results, feature columns and part-code mapping.
- `SIMULATED_Report.html`: an offline browser report with the synthetic-data notice visible.
- `SIMULATED_Manifest.json`: SHA-256 checksums for the included files. No secrets, customer details, supplier contacts, prices or actual stock counts are included.

Keep this package separate from actual store history. For PartCast website demonstrations, use a separate demo installation/database. The standalone generator does not connect to Supabase, update inventory, send email or change the application's production model. Its workbook is a labelled experiment workbook rather than an instruction to replace live imported history.

You may use these files on your own computer. In a defense or report, describe the result as **“performance on simulated demand using existing inventory catalog items.”** Evaluate actual demand separately before making store accuracy claims.

## Prepared exercise — 15 October 2026

The prepared package uses 24 existing catalog parts, 730 generated days per part, 17,520 daily rows and seed `20261015`. The final 30-day period ends 15 October 2026 and contains 4,345 generated base-unit counts across the 24 parts.

| Method | Simulated 30-day WAPE | MAE, units per part-period | RMSE |
| --- | ---: | ---: | ---: |
| Recursive XGBoost reference | 49.0006% | 88.7116 | 110.0351 |
| Direct-period XGBoost experiment | 11.7303% | 21.2367 | 25.6351 |
| Recent 28-day average | 10.8976% | 19.7292 | 24.5984 |

The direct strategy was selected between the two XGBoost candidates using earlier development periods. The simple average still has a slightly smaller final-period error. All methods and all demand profiles remain visible in the report. The generated demand CSV is identical between the original recursive exercise and the expanded comparison; no quantities, parts or dates were changed to improve the score. These are synthetic experimental results, not actual-store performance or proof of deployment readiness.
