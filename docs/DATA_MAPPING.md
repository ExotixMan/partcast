# Provided NPG Workbook Mapping

PartCast's importers were written for the structures observed in the supplied NPG workbooks.

## Inventory workbook

Observed sheets:

- `Inventory`: stock snapshot fields such as Part Number, Sub#, Description, Brand, Quantity, Unit, Location, Unit Cost, Price.
- `ABCDE  M DE LUNA`, `FGHIJ`, `KLMNO`, `PQRST`, `UVWXYZ`: historical supplier/purchase sections with fields such as Part Number, Description, Brand, Quantity, Unit Cost, Amount, Reference, Date, Supplier, and Notes/Remarks.

Mapping behavior:

- `Inventory` -> `products` current stock snapshot.
- Supplier/history sheets -> `purchase_history`, `suppliers`, and `product_suppliers`.
- Historical purchase rows do not automatically increase the stock snapshot, preventing double counting.
- A product is matched first by part number. When no part number exists, the importer tries an exact description/brand match before creating a new product.

## Customer reference transaction workbook

Observed `SI#` fields:

- Ref #
- Date
- Customer Name
- Amount
- item/part text in the next column

Mapping behavior:

- Rows -> `legacy_sales`.
- Cancelled rows are skipped.
- PartCast attempts to match a known part number contained in the raw item text.
- The source does not reliably expose quantity per item, so it is not treated as exact unit demand by default.
- Optional legacy proxy mode creates one demand observation per matched invoice row and labels it `legacy_transaction_proxy`.

## Privacy

The source workbooks contain business/customer information. They are excluded from Git by default. Import them through the authenticated web UI after deployment rather than committing them to the repository.
