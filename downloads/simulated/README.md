# PartCast — simulated training package

[Download SIMULATED_PartCast_Demo.zip](SIMULATED_PartCast_Demo.zip). On GitHub, use the download button if the ZIP preview opens.

Extract the ZIP and open `SIMULATED_Report.html` in your browser. The labelled Excel workbook, CSV data, assumptions, two trained XGBoost models and future estimates are included. Opening the report or Excel does not need Python, Supabase or API keys.

The package uses **24 existing inventory catalog identities** and **17,520 generated daily observations** over 730 days. All demand dates and quantities are simulated. The same generated records are used by every compared method.

| Method | Simulated 30-day WAPE |
| --- | ---: |
| Direct-period XGBoost experiment | 11.7303% |
| Recursive XGBoost reference | 49.0006% |
| Recent 28-day average | 10.8976% |

Lower WAPE is better. It is an error measure, not a percentage of correct forecasts. Both models exclude final-period labels from their fitted training. The direct strategy was selected using earlier development periods, while the simple average still performs slightly better on the final period. The comparison is exploratory, and the report shows every demand profile.

These scores describe simulated demand. Use the package for your own experiments or an isolated demo installation, with that label retained. It does not establish actual-store accuracy or replace the store's forecasting model or sales history.

To train again on your computer, follow the [standalone usage guide](../../docs/SIMULATED_DEMO.md). The included `SIMULATED_Catalog_Input.json` recreates the same selected parts without requiring a full private inventory workbook.
