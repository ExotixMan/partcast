# Protected sales workbooks

[Download PartCast_Actual_Quantity_Training_Protected.xlsx](PartCast_Actual_Quantity_Training_Protected.xlsx) for the latest actual-quantity extraction: 774 daily observations and 16 recovered customer/stock allocations. See [the measured results](../../docs/CUSTOMER_ALLOCATION_REVIEW.md). Same-period WAPE remains 100.3285%; the data is still insufficient for reliable current forecasts. Open in Excel using the password supplied separately, review `Recovered_Allocations`, and save a separate copy without password encryption before importing. The application cannot directly import the encrypted download. Imports replace the previous imported-training set and skip unmatched inventory IDs; check for overlap with sales already recorded in PartCast.

[Download Sales_Reconciliation_Review_Protected.xlsx](Sales_Reconciliation_Review_Protected.xlsx). On GitHub, use the download button if a preview opens.

Open the downloaded workbook in Microsoft Excel and enter the password provided separately in the PartCast conversation. The password is not stored in this repository. The workbook uses password-based Office encryption, rather than worksheet edit protection.

The older `Sales_Reconciliation_Review_Protected.xlsx` contains the identifier-only correction, source lines and owner-answer worksheet from the prior review. Its decrypted contents are byte-identical to that private review workbook. It predates the customer-allocation recovery above.

Keep your password and any decrypted copy private. The older review workbook is not a forecasting import; follow its READ_FIRST sheet and complete Owner_Answers from receipts or the owner's sales log.
