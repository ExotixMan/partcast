PARTCAST — TABLE-NAME-MATCHED SYNTHETIC DATA

This package uses the same table names and exported column names you supplied.
It is for a SEPARATE TEST DATABASE ONLY. It does not contain real sales history.
No production database was accessed or changed.

FILE -> TABLE -> EXACT CSV COLUMNS

products.csv -> products
id,part_number,description,active,current_stock
100 supplied inventory rows. Existing UUIDs and stock snapshot are preserved.
One supplied product has no part number. Preserve that blank as SQL NULL.
These are the exported columns, not a full clone of every product-table column.
Do not import this snapshot over changing production stock.

demand_observations.csv -> demand_observations
product_id,occurred_on,quantity,source
190,978 generated positive-quantity records. Every source is simulated_demo.
Product IDs match products.csv. Dates are 2016-11-09 through 2026-11-06.
The 174,022 generated zero days are omitted because the current demand table
requires quantity > 0. They remain in the earlier full daily-calendar package.
A missing event in an ordinary real-sales table does not independently confirm
zero real demand. The full calendar was synthetic and explicitly generated.

IMPORTANT SOURCE CONSTRAINT
The normal production source check does not accept simulated_demo. Therefore
this CSV is NOT directly importable into the unchanged production schema.
Keep it for an isolated test setup that explicitly supports simulated sources.
Do not relabel generated records as actual_sale or imported_training_data.
Changing filenames/columns does not make generated sales real or reliable.
Matching columns alone does not prepare or configure a Supabase demo project.

OUTPUT TABLE TEMPLATES ONLY
The templates folder contains forecast_runs.csv and demand_forecasts.csv with
matching column headers and NO rows. The forecasting engine must create real
run IDs, predictions and measured errors after a demo evaluation. This package
does not invent successful runs, predictions or error scores.

PRACTICAL USE
For the existing application's Forecasting demo, use the Excel workbooks from
the previous package. That page accepts those workbooks, not these CSVs.
For a separate database experiment, first prepare the isolated demo database,
then map products.csv to products and demand_observations.csv to the observations
table. Keep identifiers and provenance intact. Do not create duplicate tables
or weaken source constraints in your real store project to load this package.

PROVENANCE AND LIMITS
Inventory identities/descriptions: user's supplied 100-row inventory export.
All demand dates, quantities and sales patterns: generated simulation, not
observed customer sales. Generation seed: 20261106. Profiles are assumptions.
This package cannot establish or improve measured actual-store reliability.
