# Restock alerts, Gmail and editable supplier tables

Deploy the API and website from `production`. Existing stores through 0010 need [0011_restock_workflows.sql](../supabase/migrations/0011_restock_workflows.sql) in Supabase SQL Editor. Also apply [0012_sale_financial_integrity.sql](../supabase/migrations/0012_sale_financial_integrity.sql) for sale integrity; stores through 0011 need only 0012. Apply any older missing migrations first, in order. Fresh stores can use the updated [complete SQL files](../supabase/paste-ready/README.md), whose Part 2 includes these upgrades. A database rebuild or data reimport is unnecessary.

## Restock workflow repair — 18 October 2026

The list keeps its last loaded records after refresh failures and preserves full saved supplier contacts offline. Search and stock/supplier filters cover all loaded records. Large lists display 25 parts per page; each supplier email starts with that supplier's parts on the current page, with a maximum of 100 distinct parts in an edited request.

Managers can **Change supplier** on assigned parts as well as **Choose supplier** on unassigned parts. Existing cost and delivery days are loaded before editing. Migration 0011 makes changing the main supplier one transaction: invalid input or a failed new link restores the previous state completely. Other supplier links remain available.

Closing an email keeps its subject, message, quantities and custom columns while the Restock page stays open. Drafts are separate for each supplier and displayed set of parts. **Reset email draft** starts again from the displayed suggestions. Navigating away or reloading clears these in-memory drafts. Pressing Enter in an editing field never sends an email; use **Send email to supplier** explicitly. Restock success/error messages appear within the page and cannot cover a dialog's Save button.

New email requests record a unique request ID before contacting Gmail. A definite pre-delivery failure can be retried. A lost response or uncertain Gmail submission offers **Check sending result** and locks the draft. If a saved result is sent, checking/retrying returns that result without sending another copy. If no receipt exists, **Retry same request** keeps the same ID and exact contents. A request still marked sending/uncertain needs checking in Gmail Sent or with the supplier; PartCast never automatically resends it. A Gmail acceptance is not proof that the recipient read or received the message. The server also checks the reviewed recipient address, active parts, supplier assignments and staff permissions before a new submission. Older clients without request IDs lack this retry protection, so deploy and refresh the website together with the API.

These changes preserve stock, demand history, forecasts, customer balances and accounts. They do not record a delivery or finalize a purchase. See [Verification](VERIFICATION.md) for local checks and their limits.

## Small purchases match the owner's buying practice

Each suggested purchase is limited to **1–2 units per part**: one when the calculated need is one, two when it is greater, and zero when no purchase is needed. A part at or below its low-stock limit still suggests at least one. The dashboard, Restock, chatbot and initial supplier email use this policy. Estimated cost uses that purchase quantity and the saved supplier unit cost, falling back to the product's unit cost.

Expected demand remains the estimated total over the forecast period. For example, 11 expected sales with no stock suggests buying two now, rather than all 11 in one order. This is the owner's purchase limit, not evidence that two units will cover the full period or supplier lead time. Review stock, sales and delivery time regularly; several small orders may be needed. Supplier drafts remain editable, and a deliberate manual quantity is sent exactly as entered.

The API and website also apply the purchase limit to older view results and cached recommendations. Migration 0009 makes direct database queries agree. It changes only the recommendation view, preserving forecasts, accuracy metrics, stock, sales, suppliers and access policies; it can be rerun.

Verification: 97 server tests, 20 web unit tests, the production web build and five focused browser checks passed. Checks cover the repeatable SQL upgrade, unchanged forecasts/stock, corrected purchase costs, old view/cache results, both chatbot languages, mobile/desktop presentation and exact manually edited supplier quantities. These are local checks; deployment and real supplier delivery remain separate live checks.

## Why an alert could disappear from Restock

Alerts appear when stock is **at or below** the low-stock limit. Previously, a part exactly at that limit could have a calculated order quantity of zero, so Restock hid it. An empty part with a zero limit had the same problem. The updated view suggests at least one unit for every low/out-of-stock part, even when no forecast is available. Confirm or edit that quantity before ordering; suggestions use stock limits and available forecasts within the two-unit purchase limit. Parts remain listed even when no supplier has been assigned.

Restock refreshes after stock changes, on reconnect/window focus, and every minute while the page is open. The API includes low/out-of-stock statuses when querying an older view as well. Applying 0008 also aligns database reports and demand/reorder answers. This migration preserves inventory, transactions, customer balances and saved account access.

## Which stock information to enter

| Field | Meaning and example |
| --- | --- |
| Part name and part number | Identify the exact item, such as Brake pad / BP-001 |
| Unit | How it is counted: pieces, bottles, litres or sets |
| In stock now | Actual quantity on the shelf; enter on first creation, then use Sell or receive for sales/deliveries |
| Low-stock level | Alert threshold; a level of 5 warns when 5 or fewer remain |
| Reserve quantity | Extra units kept for unexpected demand; used alongside predicted sales in order suggestions |
| Cost and selling price | Purchase cost and customer selling price per unit |
| Category, brand and location | Make parts easier to find and distinguish |
| Supplier | The main supplier used for the restock request; assign it in Restock or while editing the part |
| Supplier email | Recipient of the request; save it on the supplier's contact details |
| Barcode, aliases and photos | Optional ways to identify and search for the right part |

Use **Inventory → Edit details** to change limits and part information. Use **Adjust stock** for a count correction with a reason. Use **Sell or receive → Delivery** when a supplier actually delivers items. Sending an email does not change inventory. Cashier Inventory is read-only; Super Admin, Owner, Admin and Inventory staff have the editing permissions appropriate to their roles.

## Gmail sends both login codes and supplier emails

Reviewed manual supplier requests use the **same saved Gmail connection** as login codes. A Super Admin configures it in IT settings or through the API service's `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `GMAIL_SENDER_EMAIL` environment values. Gmail send permission is required. Existing encrypted settings override environment fallback; preserve the original stable encryption key.

Brevo is no longer used by the application. Its old variables can be removed from Render after deploying this version. Store settings checks Gmail's configuration. Unattended supplier requests have been removed to align with the paper's decision-support scope; previous cron URLs return a skipped result without sending. Requests go to the saved supplier email after staff review; login codes go to the authenticated staff email. Google sending limits still apply. Connection checks and tests do not establish real message delivery; confirm with a controlled test supplier.

## Add columns or another part to the supplier email

1. Open **Restock → Review supplier email** for an assigned supplier with a saved email address.
2. Edit the subject, message, part number, description, unit and positive requested quantity.
3. Under **Customize the email table**, enter a **Column name** and choose **Add column**. Examples include Brand, Supplier part number, Delivery date or Notes. Enter a value for that column on each part. Up to five uniquely named text columns are allowed, with 50-character names and 300-character values. Existing core columns cannot be duplicated.
4. Use **Add another part from this supplier** when you want to request an additional active part assigned to that supplier, even if it is currently above the low-stock limit. Requests support up to 100 distinct parts.
5. Review the table preview and choose **Send email to supplier**. Removed parts/columns are excluded. All text is validated and HTML-escaped, and recipients remain the saved supplier email.

Custom columns belong to the email request and are kept in its existing JSON draft log. They do not add arbitrary database columns or change inventory records. Inventory's stock fields above control stock calculations; the email table lets you explain your order to the supplier. No additional database column migration is required for these email fields.
