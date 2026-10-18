# Activate and use the new PartCast features

The source changes are on `codex/partcast-offline-forecasting-20261009`. A GitHub push saves the files; Render must deploy this branch before the website changes. The hosted database and email settings also need the steps below.

## Adding another part to a supplier email — 18 October 2026

Deploy both the API and website for this fix. No new SQL migration is required.

In **Restock → Review supplier email**, **Add another part from this supplier** lists active linked parts, including in-stock parts and parts for which this business is a secondary supplier. Parts already in the email are excluded. When all linked parts are included, a message explains why the list is empty; a failed lookup offers **Try again**.

For a part without a saved link, choose **Find another part in inventory**, search its name or part number, then choose **Save supplier and add** only when that business supplies the part. This explicitly saves the relationship and adds the part to the email draft. Existing main suppliers, supplier costs and delivery settings are preserved. Search supports multiple pages and Tagalog. Adding a part does not send the email or change stock; review the quantities and message before sending.

## Compact Restock and validation update

Deploy the latest API and website from the branch above. This update adds no SQL migration; keep the earlier required migrations through 0010 installed.

On **Restock → Parts**, enter a part number, name or supplier and choose **Search**. Open **Filters** for stock status or supplier, including parts without a supplier. **Clear filters** restores the full list. On **Suppliers**, search contact details or choose **Add supplier**. Review and edit the selected parts before sending an email. If an email group exceeds 100 parts, narrow the search/filter selection first.

Page explanations are in optional help sections. Form errors name the field to correct, and failed supplier/email saves keep the entered draft open. A page that cannot render offers **Try again** and **Reload app**; the stored offline queue is preserved. See [Design references](DESIGN_REFERENCES.md) and [Verification](VERIFICATION.md).

## Mobile selling and price validation update — 18 October 2026

For a store already running migrations through 0009, run only [0010_sale_price_validation.sql](../supabase/migrations/0010_sale_price_validation.sql) in Supabase SQL Editor, then deploy both Render services from the branch above. This small migration validates new sale prices; it does not delete or rewrite inventory, old sales, accounts or customer balances. Fresh installations already include it in the complete two-part SQL and setup ZIP.

The phone bar uses **Home / Sell / Stock / Help / Menu** (Cashiers have no Home link). Full page names remain in the menu. Selling shows two item cards per row on phones and three or four when the available width permits. Names and pictures remain readable without cropping; the basket shortcut sits above phone navigation.

**Price needed** means the owner has not supplied a valid selling price. Add the part, enter a price greater than zero and check the basket before confirming. An authorized Inventory editor can choose **Save price to inventory** to use it in future sales; this needs internet. Changing a basket price alone applies only to that sale. Cashiers can enter the price supplied by the owner but cannot change the saved catalog price. PartCast never invents a price from the purchase cost.

Missing/zero sale prices block confirmation, including offline sales. Deliveries can still have zero purchase cost. The API and database also reject new unpriced sales, including direct stock RPCs. A previously queued unpriced sale requires review and re-entry with the correct price; it is not silently changed during sync.

Utang uses amounts rounded per line in integer centavos. Changing a price, quantity or basket item rechecks the amount paid. If payment exceeds the new total, the remaining balance shows **—** with an explanation and confirmation is disabled. Correct the payment or prices; payments are never silently reduced. Valid stock deductions, credit balances and retries still save together atomically.

## 1. Upgrade Supabase

Back up the database, then open your project's **SQL Editor**. Run only migrations that have not already been applied. An existing installation with migrations 0001–0004 needs the complete file [0005_store_workflows.sql](../supabase/migrations/0005_store_workflows.sql). A fresh project needs 0001, 0002, 0003, 0004, and 0005 in order.

Migration 0005 adds categories, barcodes, alternate names, private part photos, multi-item transactions, customer utang, and payments. It preserves existing products and stock movements. Existing products start in **Car parts** until you select their category. The migration creates the private `partcast-photos` Storage bucket automatically.

## 2. Required password and Gmail email code

Follow [Required login, roles and forecasting upgrade](LOGIN_ROLES_FORECASTING.md). Apply missing migrations through 0005, then **0006 by itself**, **0007 separately** and **0008** for the latest Restock fix. Stores already running 0001–0007 need only 0008 for this update. Configure Gmail OAuth credentials on the API before deploying this release. Staff must enter a password and then a six-digit code; the old alternative Supabase OTP method is no longer accepted. Gmail delivery uses Google OAuth, and Gemini uses its separate API key. Owners do not see IT settings; only Super Admin can change saved Google connections.

## 3. Deploy both Render services

Set the branch above on both the API Web Service and the website Static Site, then deploy both services after the migrations and Gmail configuration. See [Render connection settings](RENDER_CONNECTION.md) for the correct URLs and matching Supabase keys. The site is `https://partcast-web.onrender.com`; its API is `https://partcast.onrender.com`. All Supabase keys must belong to `https://ragdjkdcrvexqfadlqbf.supabase.co`.

Frontend public settings are embedded at build time, so changing them requires a new website build. Keep the service-role, AI, and supplier email keys on the API service. This update adds `sharp` to the API installation and a camera barcode decoder to the website installation; the committed lockfiles and existing `npm ci` deployment commands include them.

After deploying, open API `/health`, sign in, and wait for **Inventory saved**. Check the new screens below with a test product and test customer. Confirm a Gmail code arrives after a correct password for an existing active staff account. Deploying source alone does not prove the migration, email provider, or camera works on your device.

## Everyday store tasks

### Sell or receive several parts

Open **Sell or receive**, choose **Sell parts** or **Receive delivery**, then tap parts to add them to the basket. Change quantities and prices, enter a customer or delivery reference if needed, review the total, and confirm once. No receipt is generated.

For a credit sale, select **Customer will pay later (utang)**. Enter the customer, amount paid now, and optional due date. The amount still owed is saved with all stock deductions in one database transaction. If one line cannot be fulfilled, the whole sale is rejected. A delivery adds all selected quantities together.

Quantities and prices allow up to two decimal places. Empty values, negative prices, zero quantities, excessive totals, duplicate lines, and selling more stock than available are rejected. Concurrent sales are checked again against the database.

### Customer utang

Open **Customer utang** to search customers, see amounts owed, filter still owing/past due/fully paid, and view payment history. **Record payment** accepts a partial payment or the remaining amount. Payments cannot exceed the balance. **Add existing customer utang** records a balance already owed; use the sales basket for a new credit sale. An existing balance may have a past due date; enter its original due date to mark it past due immediately. This tracker covers customer debts only.

Manual existing debts and payments require an internet connection and freshly loaded balances. If a request loses its response, it remains in the durable queue with its original operation ID. Review the waiting change and retry the same save. The database applies an identical retry once. The screen disables additional payments while a ledger save awaits confirmation.

Credit sales can be recorded offline after the account and inventory have been saved. Their stock changes and new customer balance send together when internet returns. Saved balances may be viewed offline, but they are not authoritative for recording a payment.

### Categories, alternate names, and photos

In **Inventory → Edit details**, select **Car parts**, **Oils & lubricants**, **Gas & fuel**, **Accessories**, or **Other**. Add a barcode and comma-separated alternate names to help search find the same product under different terms.

Save a new product before uploading its photos. Each product accepts up to four JPEG, PNG, or WebP images, each under 5 MB. The API decodes the image, rejects invalid files and excessive dimensions, strips metadata, and stores a resized WebP up to 1600 pixels wide/high. Photo storage is private; an active staff session is required to load it. Tap an inventory thumbnail to view all saved photos.

Uploading/removing photos requires internet. Photos already viewed are saved for that account on that device for up to 12 hours. Unviewed photos need a connection. Sign-out clears the account's local photo cache along with other saved store information.

### Barcode search

Choose **Scan** to use the device camera, a USB scanner, or manual barcode entry. Camera access requires HTTPS and permission. If the camera is unavailable, the dialog explains how to type the barcode.

A known barcode finds the saved part and its saved photos; in the sales basket it adds that part. A new barcode offers **Add this part** with the barcode already filled in. The user supplies the correct name, category, price, stock, and photos. A barcode alone cannot reliably provide a product name or picture. Scanning depends on barcode format, lighting, camera focus, and device capabilities.

### Chat, language, and appearance

Use the header assistant button or mobile **Help** button. The assistant no longer floats over pagination. It first uses local help/terminology, then live database facts, then optional Gemini when a key is configured. Without internet it uses the account's saved inventory and identifies its age.

The assistant understands common Tagalog inventory questions and alternate part terms such as **langis ng makina / engine oil**, **pastilyas / brake pad**, and **buji / spark plug**. Store-specific alternate names improve matching. Coolant/radiator fluid and the radiator component are related but different products; the assistant explains the distinction and recommends confirming the vehicle fit.

Select **English / Tagalog** in the header or login screen to translate the interface and its instructions. Use the sun/moon button to switch between light and dark appearance. Both choices persist on the device. The default is light with solid colors. Customer names, product descriptions, entered messages, and external provider responses remain their original business content.

### Edit the supplier email

In **Restock → Review supplier email**, edit the subject, message, part number, description, unit and requested quantities. Use **Customize the email table** to add up to five uniquely named text columns, then fill values for each part. Add another active part assigned to that supplier when needed, remove unneeded rows/columns, and check the table preview before sending. The recipient stays the saved supplier email. Inputs are validated and escaped in the HTML email. See [Restock and stock-field setup](RESTOCK_GMAIL.md) for limits and examples.

This manual draft does not change product descriptions, stock or automatic restock email settings. Automatic email continues using the store's saved recommendations and cooldown. Both manual and automatic requests use the same Gmail connection as login codes. Actual delivery requires valid Gmail OAuth authorization and sending capacity. Email acceptance and logging cannot guarantee exactly one delivery across every server/provider crash.

### Download Excel reports

Open **Reports**, choose start/end dates and an optional category, then download a report. Leave dates empty for all records. An inverted range is rejected. Dates include the whole selected end date in Philippines time; detailed transaction timestamps are labeled UTC. Dated filenames include the range.

- **Sales totals** contains gross sales, daily totals, and each sold part. Credit sales count as sales; this is not a cash-received report.
- **Inventory report** shows current quantities and a separate sheet of stock changes within the selected dates. It does not reconstruct historical stock on the end date.
- **Transaction report** filters stock movements by the selected dates/category.
- **Customer utang report** selects debts by their original date and shows current balances and payment totals recorded so far. It is not a historical balance snapshot.
- **Reorder report** shows current suggestions. Dates and category do not change this report.

Reports need internet and download directly to the browser's Downloads folder. Excel backups now include basket and customer ledger tables plus product photo paths. The private photo files remain in Supabase Storage; an Excel backup alone is not a complete database-and-photo restore.

## Verification and remaining live checks

See [verification](VERIFICATION.md) for the latest suite results and production-build checks. Production dependency audits reported no known vulnerabilities in both packages at the time of testing. Tests use synthetic store/customer records. Database tests execute migrations 0001–0008 in PostgreSQL through PGlite and exercise atomic baskets, credit, idempotent retries, overpayment/precision checks, active-account access, notifications, Restock thresholds and direct-write restrictions. Server tests build and reopen real Excel workbooks and decode real image bytes. Chromium tests exercise responsive screens, offline reload/reconnect, edited mail payloads, photo gallery caching, camera denial/manual entry, bilingual/dark preferences, and mocked password-then-Gmail-code success/denial.

These checks do not send real staff/supplier emails, apply changes to hosted Supabase, deploy Render, or establish physical-camera accuracy. Complete those live checks after the activation steps. Existing forecasting data-quality requirements still apply; see [Forecasting data](FORECASTING_DATA.md).
