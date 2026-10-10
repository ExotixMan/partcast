# Activate and use the new PartCast features

The source changes are on `codex/partcast-offline-forecasting-20261009`. A GitHub push saves the files; Render must deploy this branch before the website changes. The hosted database and email settings also need the steps below.

## 1. Upgrade Supabase

Back up the database, then open your project's **SQL Editor**. Run only migrations that have not already been applied. An existing installation with migrations 0001–0004 needs the complete file [0005_store_workflows.sql](../supabase/migrations/0005_store_workflows.sql). A fresh project needs 0001, 0002, 0003, 0004, and 0005 in order.

Migration 0005 adds categories, barcodes, alternate names, private part photos, multi-item transactions, customer utang, and payments. It preserves existing products and stock movements. Existing products start in **Car parts** until you select their category. The migration creates the private `partcast-photos` Storage bucket automatically.

## 2. Required password and Gmail email code

Follow [Required login, roles and forecasting upgrade](LOGIN_ROLES_FORECASTING.md). Apply missing migrations through 0005, then **0006 by itself** and **0007 separately**. Configure Gmail OAuth credentials on the API before deploying this release. Staff must enter a password and then a six-digit code; the old alternative Supabase OTP method is no longer accepted. Gmail delivery uses Google OAuth, and Gemini uses its separate API key. Owners do not see IT settings; only Super Admin can change saved Google connections.

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

In **Restock → Review supplier email**, edit the subject, message, part number, description, and requested quantities. Remove unneeded rows, then send the reviewed table. The recipient stays the saved supplier email, and selected products must belong to that supplier's saved recommendations. Inputs are validated and escaped in the HTML email.

This manual draft does not change product descriptions or automatic restock email settings. Automatic email continues using the store's saved recommendations and cooldown. Actual delivery requires a verified Brevo sender and API key. Email acceptance and logging cannot guarantee exactly one delivery across every server/provider crash.

### Download Excel reports

Open **Reports**, choose start/end dates and an optional category, then download a report. Leave dates empty for all records. An inverted range is rejected. Dates include the whole selected end date in Philippines time; detailed transaction timestamps are labeled UTC. Dated filenames include the range.

- **Sales totals** contains gross sales, daily totals, and each sold part. Credit sales count as sales; this is not a cash-received report.
- **Inventory report** shows current quantities and a separate sheet of stock changes within the selected dates. It does not reconstruct historical stock on the end date.
- **Transaction report** filters stock movements by the selected dates/category.
- **Customer utang report** selects debts by their original date and shows current balances and payment totals recorded so far. It is not a historical balance snapshot.
- **Reorder report** shows current suggestions. Dates and category do not change this report.

Reports need internet and download directly to the browser's Downloads folder. Excel backups now include basket and customer ledger tables plus product photo paths. The private photo files remain in Supabase Storage; an Excel backup alone is not a complete database-and-photo restore.

## Verification and remaining live checks

See [verification](VERIFICATION.md) for the latest suite results and production-build checks. Production dependency audits reported no known vulnerabilities in both packages at the time of testing. Tests use synthetic store/customer records. Database tests execute migrations 0001–0007 in PostgreSQL through PGlite and exercise atomic baskets, credit, idempotent retries, overpayment/precision checks, active-account access, notifications, and direct-write restrictions. Server tests build and reopen real Excel workbooks and decode real image bytes. Chromium tests exercise responsive screens, offline reload/reconnect, edited mail payloads, photo gallery caching, camera denial/manual entry, bilingual/dark preferences, and mocked password-then-Gmail-code success/denial.

These checks do not send real staff/supplier emails, apply changes to hosted Supabase, deploy Render, or establish physical-camera accuracy. Complete those live checks after the activation steps. Existing forecasting data-quality requirements still apply; see [Forecasting data](FORECASTING_DATA.md).
