# PartCast blank import templates

All templates contain headers and instructions, without business records. Fill them with genuine data before upload.

| File | Import selection |
| --- | --- |
| PartCast_Past_Invoices_Template.xlsx | Past sales and customer records |
| PartCast_Forecasting_Quantities_Template.xlsx | Sales quantities for forecasting |
| PartCast_Inventory_Template.xlsx | Inventory and purchases |

Use Excel or CSV, not both versions of the same data. Dates use YYYY-MM-DD. Amount is pesos; Demand Quantity is units sold; inventory Quantity is current on-hand stock. Save edited CSV as CSV UTF-8 (Comma delimited).

Forecasting imports replace prior imported history. Inventory imports replace supplied stock balances and can set missing cost/price fields to zero; fill their actual values. Invoice imports save reporting records without supplying forecast quantities. The atomic history upgrade does not cover inventory or invoice imports.

These files are public templates. No customer names, sales rows, product catalog or database credentials are included.
