# PartCast — Pre-defense QA Checklist

Manual test record for NPG Auto Parts. All results start blank; this document is not evidence that manual tests have passed.

**Tester:** __________  **Test date:** __________  **Build/commit:** __________
**Environment/database:** __________  **Device/browser:** __________

## How to use

- Use a separate test database for sales, receipts, imports, payments, email and security checks. The actual store remains read-only unless its owner authorizes a specific real transaction.
- Enter Pass, Fail, Blocked or N/A for every case. N/A requires a reason. Save screenshots or recording references using the case ID.
- P0 = critical: stock, money, access, data integrity or the main forecasting pipeline. P1 = important workflow/usability.
- Use controlled staff/supplier mailboxes. Keep passwords, codes, keys and customer data out of screenshots.

## Sale arithmetic reference

| Step | Expected |
| --- | --- |
| Begin with 5 units at PHP 100 | Stock 5 |
| Sell 2 units | Stock 3; sale PHP 200 |
| Receive 1 unit | Stock 4 |
| Attempt to sell 5 | Rejected; stock remains 4 |

## 1. Deployment and sign-in

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-01-01 / P0 | **Release and database** — Check both Render services and database migrations. | Both services use the intended production commit; required migrations through 0012 are applied. |  |  |
| QA-01-02 / P0 | **Password followed by email code** — Sign in with a correct password, then enter the received code. | Store pages open only after both steps succeed; password alone cannot open protected pages. |  |  |
| QA-01-03 / P1 | **Wrong or expired credentials** — Try a wrong password, wrong code and an expired code. | Access is refused with a clear message; no store data is shown. |  |  |
| QA-01-04 / P1 | **Resend and attempt limits** — Resend a code and check excessive attempts in the test environment. | Resend delay and attempt limits work; a new valid code allows recovery. |  |  |
| QA-01-05 / P0 | **Logout and direct links** — Sign out, then reopen a protected URL or use the Back button. | Protected store information cannot be reopened without a valid sign-in. |  |  |
| QA-01-06 / P0 | **Account roles** — Sign in as Super Admin, Owner and Cashier; check menus and direct page URLs. | Each role follows approved permissions. Owner and Cashier cannot open IT settings. |  |  |
| QA-01-07 / P0 | **Permission checks on the API** — With a test account, attempt a management request outside its role. | The server denies the request even if the screen or URL is bypassed. |  |  |
| QA-01-08 / P1 | **Service connection** — Open the website after the API has been idle; check health and reconnect. | Loading and retry messages are understandable; successful reconnection loads the correct store. |  |  |

## 2. Inventory and part lookup

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-02-01 / P0 | **Create and edit a part** — Add a test part, edit its details, save, then reload. | Saved part number, description, category, stock limits and price are correct. |  |  |
| QA-02-02 / P1 | **Required fields and duplicates** — Try blank required fields, a duplicate identifier and invalid numeric values. | Invalid entries are rejected with a field-specific message; no duplicate part is created. |  |  |
| QA-02-03 / P1 | **Search, filter and pagination** — Search by part number, description, barcode and alternate name; combine category filters and pages. | Only matching parts appear; page counts and Next/Previous remain correct. |  |  |
| QA-02-04 / P1 | **Part photos** — Upload a valid image and open its preview on Inventory and Sell or receive. | The complete image is visible, opens when tapped, and belongs to the correct part. |  |  |
| QA-02-05 / P1 | **Invalid photo upload** — Try an unsupported file and an image exceeding the allowed size. | The upload is refused clearly; the existing photo is preserved. |  |  |
| QA-02-06 / P0 | **Stock correction** — Make an authorized correction with a reason; try a negative or excessive correction. | Valid correction is saved in history; invalid changes do not alter stock. |  |  |
| QA-02-07 / P1 | **Deactivate a part** — Deactivate a test part and look for it in active stock/sale choices. | It is excluded from active selling while historical records remain available. |  |  |
| QA-02-08 / P1 | **Barcode and unknown codes** — Scan a known code, enter it manually, then try an unknown code. | The correct part opens; an unknown code gives a clear next step and does not invent item details. |  |  |

## 3. Selling and receiving

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-03-01 / P0 | **Sale and stock arithmetic** — Start with 5 units at PHP 100; sell 2 units. | Stock becomes 3; the sale total is PHP 200; the sale is recorded once. |  |  |
| QA-03-02 / P0 | **Receive stock** — After the sale above, receive 1 unit. | Stock becomes 4; the delivery is recorded separately from customer demand. |  |  |
| QA-03-03 / P0 | **Insufficient stock** — With stock at 4, try to sell 5 units. | The sale is rejected; stock remains 4 and no sale or debt is added. |  |  |
| QA-03-04 / P0 | **Multi-part basket** — Sell or receive several different parts in one transaction. | Each line and the combined total are correct; all stock changes commit together. |  |  |
| QA-03-05 / P0 | **Price and quantity validation** — Try missing/zero selling prices, zero/negative quantities and unsupported decimal precision. | Invalid sales are blocked; the user is told which values to correct. |  |  |
| QA-03-06 / P0 | **Zero-cent line in a basket** — Include quantity 0.01 at price PHP 0.01 beside another valid sale line. | The basket is blocked because every sale line must round to at least PHP 0.01. |  |  |
| QA-03-07 / P0 | **Totals after editing** — Change quantities and selling prices, including before creating credit. | Displayed total, payment and balance recalculate correctly; no negative balance appears. |  |  |
| QA-03-08 / P1 | **Free stock receipt** — Receive a valid test delivery with zero cost where intended. | The delivery is allowed and increases stock; a free sale remains blocked. |  |  |
| QA-03-09 / P0 | **Double-click and interrupted retry** — Double-click Confirm, or interrupt a response and retry the same transaction. | Only one transaction is saved and stock is deducted or added once. |  |  |
| QA-03-10 / P0 | **Sales history** — Check the saved sale after reloading and compare it with the basket. | Date, customer, items, quantities and amounts match the confirmed transaction. |  |  |

## 4. Customer utang

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-04-01 / P0 | **Create a customer balance** — Record a PHP 200 credit sale with PHP 50 paid. | Customer balance is PHP 150; stock and sales totals match the sale. |  |  |
| QA-04-02 / P0 | **Partial payment** — Record a PHP 100 payment against that balance. | Remaining balance is PHP 50 and payment history shows PHP 100 once. |  |  |
| QA-04-03 / P0 | **Complete payment** — Pay the remaining PHP 50. | Balance becomes zero and the account is shown as paid. |  |  |
| QA-04-04 / P0 | **Invalid payments** — Try zero, negative and excessive payments. | Each invalid payment is refused; the balance and history remain unchanged. |  |  |
| QA-04-05 / P1 | **Correct customer history** — Switch customers while payment history is loading; retry a failed history request. | Amounts and payment history remain attached to the selected customer. |  |  |
| QA-04-06 / P1 | **Outstanding credit date** — For a credit sale with money still due, choose a due date before the sale date. | The date is rejected with a clear correction message. |  |  |
| QA-04-07 / P1 | **Unused due date** — Switch from credit to cash, or fully pay a credit sale, after entering an old due date. | The unused due date does not prevent saving and no outstanding debt is created. |  |  |

## 5. Restock, notifications and Gmail

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-05-01 / P0 | **Low-stock threshold** — Use test parts below and exactly at their minimum stock level. | Both parts appear in Restock and the applicable stock alerts. |  |  |
| QA-05-02 / P0 | **Out-of-stock threshold** — Use a zero-stock part, including one with a zero minimum. | The part appears as out of stock and can be reviewed for replenishment. |  |  |
| QA-05-03 / P1 | **Restock search and filters** — Combine part search, category and supplier filters; clear filters and change pages. | Results and counts match the selected filters; clearing filters restores the list. |  |  |
| QA-05-04 / P1 | **Small purchase policy** — Review suggested quantities on parts needing replenishment. | Positive suggestions follow the owner's one-to-two-unit purchasing policy. |  |  |
| QA-05-05 / P0 | **Choose or change supplier** — Assign a supplier, change it, save, then reload the part. | The intended primary supplier is saved correctly; failure preserves the previous assignment. |  |  |
| QA-05-06 / P1 | **Additional supplier parts** — Open an email draft and select Add another part from this supplier. | Eligible assigned parts appear; already selected parts are not duplicated. |  |  |
| QA-05-07 / P1 | **Edit the supplier draft** — Edit quantities, rows, custom columns, subject and message; close and reopen while staying on the page. | The draft and preview match the edits; invalid fields are clearly identified. |  |  |
| QA-05-08 / P0 | **Send through Gmail** — Send one reviewed request to a controlled test supplier mailbox. | The correct recipient receives the edited table and message through Gmail. |  |  |
| QA-05-09 / P0 | **Interrupted email request** — Interrupt a send response; check its sending result before retrying. | The system checks the existing request and does not send a duplicate message. |  |  |
| QA-05-10 / P1 | **Notification updates** — Change test stock across a threshold; refresh, read and filter alerts. | Alerts reflect the new stock and the intended read/unread state. |  |  |
| QA-05-11 / P1 | **Unobstructed controls** — Trigger notices on a small phone while a dialog or paginated list is open. | Save, Close and Next remain reachable; success messages dismiss without hiding controls. |  |  |

## 6. Demand forecasting — defense priority

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-06-01 / P0 | **Deployed forecasting runtime** — Check forecasting on the deployed API, not only the local computer. | Python, numpy, pandas, scikit-learn and XGBoost are available and an eligible forecast completes. |  |  |
| QA-06-02 / P0 | **Import source matching** — Compare accepted demand rows with source documents. | Exact part numbers, sale dates and actual quantities sold match the source. |  |  |
| QA-06-03 / P0 | **Correct demand meaning** — Review invoice-only and received-stock imports. | Invoice amounts and supply quantities are not converted into customer demand. |  |  |
| QA-06-04 / P1 | **Import results and unmatched parts** — Import a reviewed test workbook and read added/skipped/unmatched counts. | Results explain what entered demand history and which parts need review. |  |  |
| QA-06-05 / P0 | **Duplicate demand prevention** — Check a sale represented in imports and counter history. | The same real sale is not counted twice in model input. |  |  |
| QA-06-06 / P0 | **Eligible history and horizon** — Use a suitable separate test dataset; choose the intended planning horizon and update. | Forecasts are produced for the eligible parts and requested period. |  |  |
| QA-06-07 / P1 | **Insufficient or stale history** — Use sparse, stale, future-dated or otherwise invalid test history. | Unsupported history is excluded or rejected with a useful message; no false success is claimed. |  |  |
| QA-06-08 / P0 | **Forecast output integrity** — Review part identities, dates and predicted quantities. | Results belong to known parts, use valid future dates and contain finite nonnegative quantities. |  |  |
| QA-06-09 / P0 | **Chronological evaluation** — Review the training/testing procedure and saved validation results. | Each test period is predicted before its sales are used for fitting or selection. |  |  |
| QA-06-10 / P0 | **Metrics and baseline** — Review WAPE, unit error, actual/predicted totals and recent-sales baseline. | Values are finite when defined, interpretable and presented alongside the baseline. |  |  |
| QA-06-11 / P0 | **Honest performance explanation** — Compare XGBoost with the baseline and identify the source of test records. | A worse model is disclosed; generated data remain labelled simulated and are not claimed as actual-store evidence. |  |  |
| QA-06-12 / P1 | **Missing-day and coverage limits** — Review gaps, stockouts and incomplete recording before recommending an order. | Unrecorded days are not described as confirmed zero sales; coverage limitations are documented. |  |  |

## 7. Offline operation and installation

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-07-01 / P1 | **Install on the demonstration device** — Install the PWA using the supported browser on the actual phone or laptop. | The application opens from its installed icon with the intended name and layout. |  |  |
| QA-07-02 / P0 | **Prepare and reopen offline** — Load permitted information online, disconnect, then reopen the application. | Previously saved inventory is available and connection status is clear. |  |  |
| QA-07-03 / P0 | **Record an offline sale** — Make an authorized sale in the separate test environment while disconnected. | Local stock changes correctly and the transaction is shown as waiting to send. |  |  |
| QA-07-04 / P0 | **Reconnect and synchronize once** — Reconnect and wait for synchronization; refresh after completion. | One server sale exists and stock is deducted once; the pending indicator clears. |  |  |
| QA-07-05 / P0 | **Durable pending work** — Reload or close/reopen before a queued transaction synchronizes. | Pending work survives and is not silently lost. |  |  |
| QA-07-06 / P0 | **Stock conflict and expired verification** — Cause a test stock conflict or expire verification before sending queued work. | The system explains recovery, preserves pending work and does not silently overwrite stock. |  |  |
| QA-07-07 / P0 | **Account isolation** — Sign out and use another test account or password session. | The new account cannot borrow another account's cached information or verification. |  |  |
| QA-07-08 / P1 | **Internet-required actions** — Try email and forecasting without internet access. | A clear message explains the connection requirement; no false completion is shown. |  |  |
| QA-07-09 / P1 | **Camera fallback** — Deny camera permission, then use manual barcode entry. | The app remains usable and explains how to enter the code manually. |  |  |

## 8. Reports, security and usability

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-08-01 / P0 | **Date-range report totals** — Export a known test period, including its first/last dates and a category. | Included rows, quantities and totals match the saved source transactions and chosen filters. |  |  |
| QA-08-02 / P1 | **Excel file delivery** — Download the report on the actual defense laptop and open it in Excel. | The file downloads and opens successfully with readable dates, quantities and amounts. |  |  |
| QA-08-03 / P0 | **Search input safety** — In the separate test environment, enter quotes, punctuation and SQL-like text into search. | Search remains a text lookup; it does not crash, expose extra records or bypass permissions. |  |  |
| QA-08-04 / P0 | **Private data access** — Try opening private photos, backup links and management data without the required authorization. | Access is denied; any signed links follow their intended expiry. |  |  |
| QA-08-05 / P0 | **Secrets stay server-side** — Review the website build/configuration with the technical team. | Service-role keys, Google secrets, refresh tokens and setup/cron secrets are absent from public files. |  |  |
| QA-08-06 / P1 | **Failure and retry experience** — Interrupt a refresh or save, then retry. | Entered information is preserved and the message states the next action clearly. |  |  |
| QA-08-07 / P1 | **Phone, tablet and desktop** — Use each main page, navigation menu, dialog, search and pagination at the target sizes. | Text and controls remain readable, reachable and free from horizontal clipping. |  |  |
| QA-08-08 / P1 | **Language, dark mode and larger text** — Switch English/Tagalog, change the theme and increase text size. | Main workflows remain understandable, readable and usable without hidden buttons. |  |  |
| QA-08-09 / P1 | **Unaided user task** — Ask a nontechnical person to complete a sale and locate a low-stock part. | They complete both tasks without developer guidance; difficulties are recorded for improvement. |  |  |

## 9. Chatbot and customer terminology

| ID / Priority | Test and steps | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| QA-09-01 / P1 | **Readable replies** — Ask for stock, price and restock information in English and everyday Tagalog. | Replies are short, readable and organized; Tagalog uses familiar words. |  |  |
| QA-09-02 / P0 | **Store facts and uncertainty** — Compare chatbot stock, price and restock replies with current records; ask about an unknown part. | Known facts match records; missing information is acknowledged rather than invented. |  |  |
| QA-09-03 / P1 | **Part terminology** — Ask about coolant/radiator fluid and about the radiator assembly. | Related fluid terms help find the right product; fluid and radiator assembly are not incorrectly treated as the same item. |  |  |
| QA-09-04 / P1 | **Fallback behavior** — Try a local help question, a store-data question and a question requiring configured AI fallback. | The intended answer source is used; unavailable AI gives a useful message without exposing private data. |  |  |

## Forecasting interpretation

Readiness checks include at least five distinct sale days across 35 calendar days, recent usable sales and enough rows after feature creation and chronological testing. Passing readiness does not establish accuracy. Do not call 100 minus WAPE an accuracy percentage. There is no universal passing WAPE: explain units missed, comparison with the baseline and the limitations of the data. Simulated results cannot establish actual-store accuracy.

## Defect report

**Bug ID / linked case:** __________  **Priority:** __________  **Build/device:** __________

**Steps to reproduce:**
1. __________
2. __________
3. __________

**Expected:** __________

**Actual:** __________

**Evidence link:** __________  **Assigned to:** __________

**Fix commit:** __________  **Retest date/result:** __________

## Results and sign-off

**Total cases:** 78  **Pass:** ____  **Fail:** ____  **Blocked:** ____  **N/A:** ____

**Open critical defects:** ____  **Open important defects:** ____

**Decision:** Ready / Not ready / Ready with documented minor issues

**Tester:** __________  **Reviewer/owner:** __________  **Date:** __________

Do not proceed with unresolved stock errors, incorrect money calculations, duplicate transactions, unauthorized access or a forecasting pipeline that fails on the demonstration dataset. Retest every fix and its affected workflow. Minor issues need an owner and an agreed explanation. A passing checklist does not prove real-store forecast accuracy.

Suggested defense sequence: sign-in → multi-part sale → stock change → utang payment → Restock → demand forecast and baseline → offline sale synchronized once.
