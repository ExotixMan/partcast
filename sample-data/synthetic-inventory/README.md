# Synthetic inventory dataset

This dataset is **generated demonstration data**, not actual store sales. It cannot establish actual-store forecast reliability.

## Download

Open a file below, then select **Download raw file** in GitHub. Downloading the ZIP is the smallest transfer. A private repository requires signing in with an account that can access it.

- [ZIP package](PartCast_Table_Names_SYNTHETIC.zip) — includes both CSVs, empty output-table templates and instructions.
- [demand_observations.csv](demand_observations.csv) — 190,978 generated positive-quantity records.
- [products.csv](products.csv) — the 100 supplied inventory identities and stock snapshot.

## Matching columns

| File | Columns |
|---|---|
| `demand_observations.csv` | `product_id, occurred_on, quantity, source, source_reference` |
| `products.csv` | `id, part_number, description, active, current_stock` |

Every generated observation has `source = simulated_demo`. The dates cover November 9, 2016 through November 6, 2026. Product identifiers match the supplied catalog. Generated zero days are excluded because the current observations table requires positive quantities.

Each `source_reference` has the format `SIMULATED:<product_id>:<occurred_on>`. It uniquely labels an item/date within this file and is not a real invoice or transaction reference.

## Intended use

Use only in a separately prepared test database that explicitly supports simulated observations. The unchanged production source constraint rejects `simulated_demo`; matching column names alone does not make this a production-ready import. Preserve the synthetic source labels.

The catalog is an existing snapshot: importing it over current production inventory could overwrite newer stock. The provided inventory export contains 100 products, not a confirmed complete catalog.

The ZIP's `forecast_runs.csv` and `demand_forecasts.csv` files contain headers only. The forecasting engine must generate predictions and measured errors; this package does not invent successful runs or scores.

For provenance and limitations, see [READ_ME_FIRST.txt](READ_ME_FIRST.txt) and [manifest.json](manifest.json).
