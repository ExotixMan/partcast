# Capstone scope and owner additions

Reviewed against the user-supplied **PartCast chapter 1 revised,
chap2&3(not checked yet).pdf** on 17 October 2026. This is an implementation
mapping, not an assertion that the manuscript or owner confirmations were
independently validated. The PDF is not rewritten by this change.

## Main objective

The general objective on PDF page 6 is a web inventory system using XGBoost
Regression for NPG Autoparts. Specific objectives include transaction
correctness, stock accuracy, low-stock/reorder behavior and regression
evaluation, together with usability, efficiency, reliability and security.
The method discussion on page 40 names MAE and RMSE. Both are displayed in
the demo alongside WAPE; WAPE is an error measure, not a conventional
accuracy percentage.

| Paper scope | Application workflow |
| --- | --- |
| Product and centralized inventory monitoring | Inventory, categories, filters and current stock |
| Stock-in/out and sales monitoring | Sell or receive, multiple-item baskets and stock history |
| Low-stock alerts | Alerts, stock thresholds and restock list |
| Frequently sold and slow-moving parts | Home → Sales & store insights |
| XGBoost estimates and evaluation | Demand planning → Store demand |
| Reorder decision support | Restock, with staff-controlled supplier requests |
| Inventory, transaction and sales reporting | Reports with inclusive date ranges |
| Authorized access and security | Password + Gmail code, role restrictions and private backups |

Demand planning is prominent in the main navigation and Home actions.
Store forecasts use dated quantities sold for each identified part. Receiving
stock is not itself customer demand. Imported invoice amounts remain visible
under Saved past sales but are not converted into unit sales. Missing days
are not asserted to be confirmed zero sales.

## Owner suggestions retained

| Owner suggestion | Kept behavior |
| --- | --- |
| Customer utang | Customer balances, partial payments and due dates; no supplier debt or full accounting |
| Tagalog chatbot and customer terminology | Local guidance first, store facts next, configured Gemini fallback |
| Coolant / radiator terminology | Cooling fluid aliases supported; radiator assembly remains a different product |
| Editable supplier email cells and message | Review the parts table, custom columns and message before sending through Gmail |
| Gas, lubes and parts | Inventory categories and filters |
| Part pictures | Staff uploads, whole-image previews and galleries |
| Barcode | Camera or manual barcode lookup, with guided entry for unknown codes |
| Multiple-item selling and receiving | One validated basket operation; no new receipt/accounting module |
| Pagination unobstructed | Assistant opens from Help rather than a floating button covering Next |
| Partsouq and Toyota specialty | Part-number lookup link in the inventory editor; external reference only |
| English/Tagalog, dark mode | Existing preferences retained and new controls translated |
| Date-range exports | Existing sales, inventory, transactions, utang and restock exports retained |
| Offline operation | Existing owner-requested saved stock and queued sales retained; forecasts and email need the API |

The paper's platform description assumes an internet connection; offline
operation is an explicit owner extension. Customer utang is also an owner
extension to the narrower paper scope. Neither is removed. The user confirmed that **19 September 2011** is the
store opening date. It appears under My account → About NPG Autoparts and
is not entered as a sale date.

## Removed from the active workflow

PDF pages 10–11 keep purchasing decisions with staff and exclude automatic
supplier transactions. The unattended supplier-request scheduler and its
setting are removed. Existing cron URLs return a skipped result without
querying supplier settings, sending Gmail, or changing purchase records.
The reviewed manual Gmail workflow remains available. Login email codes
and in-app stock notifications remain supported.

The one-unit-per-invoice quantity assumption is removed from importing and
store forecasting. Old clients trying to enable it receive an actionable
validation error before a new import batch or training run is written.
Historical proxy rows and old settings are retained in the database for
traceability, but are excluded from actual-store model input. Settings cannot
re-enable either retired option. No schema reset or data deletion is needed.

Vehicle repairs, payroll, full accounting and online payments remain absent.
Staff account access and backups support the paper's security/reliability
requirements and are kept under management controls.

## Separate demonstration

Demand planning → Practice demo provides the workbook download and upload.
The same original 6,570 simulated daily rows for nine identified part numbers
are retained; no dates or quantities were changed to improve scores. Normal
store imports reject this workbook before database writes. Demo results
neither alter store forecasts/restock suggestions nor establish store accuracy.

The real Node/Python demo service was rerun: validation-selected XGBoost
test WAPE **17.5016%**, MAE **3.0725**, RMSE **5.0789**, over 18 complete
30-day part-periods. A 365-day average achieved **12.3028% WAPE**, which is
better on this sample and is shown alongside XGBoost. These previously
inspected simulated periods are not a fresh independent actual-sales test.

See `downloads/capstone-demo/START_HERE.txt` for the demo-only delivery.
Deploy API and website together from the latest Codex branch commit. No new
keys or migrations are required. The live API still needs Python with numpy,
pandas, scikit-learn and xgboost; use the supplied Render build/start scripts.
Local automated tests do not confirm live Gmail delivery, physical camera
behavior, supplier catalog fitment, deployment status or real-store accuracy.

## Verification completed on 17 October 2026

- Server: **78 tests passed**, including PostgreSQL permissions and stock
  calculations, password/email-code access, reviewed Gmail content, rejected
  automation flags and rejection of assumed invoice quantities before writes.
- Website: **18 tests passed**, including translation coverage, offline
  account isolation, retry protection and decimal quantities.
- Browser: **51 distinct cases passed across the full run and focused
  rechecks**. The final affected-page recheck passed all four cases after
  correcting the 320-pixel import layout. The checks cover every application
  page at phone, tablet and desktop sizes, the sample Excel download, malformed
  history responses, alert search/read/offline behavior, sales, utang, photos,
  barcode entry, supplier editing, date-range downloads and role restrictions.
- Production build completed. Test-only connection settings were used for
  the browser build; production environment files were not changed.
- The real demo service returned the measured results above with **zero
  store database calls**. All four normal import choices reject the sample.
- Demo source bytes, split counts, all nine existing inventory identities,
  Excel/JSON metrics and every ZIP entry were checked. The simulated input
  rows remain byte-for-byte identical to the previously supplied sample.
