# Light, task-focused PartCast interface

The interface is designed around the tasks store staff perform every day: find a part, record a sale, receive a delivery, and check what needs restocking. White surfaces, a light gray background, and solid red accents replace the dark navigation and sign-in screens. No gradients are used.

## Compact pages and clearer errors — 18 October 2026

Restock now puts search and the parts list first. Search covers part numbers, names and supplier names; the Suppliers tab searches contact names, email addresses and phone numbers. **Filters** opens stock-status and supplier choices on phones, shows the number of active filters and keeps **Clear filters** available. Matching counts remain distinct from loading/error messages. Filtered email reviews include only the visible matching parts, and a group above the existing 100-part email limit asks the user to narrow the list first.

The phone tabs use short labels, supplier groups have compact headers, and **Add supplier** belongs to the Suppliers tab. Repeated instruction panels and large decorative statistics have been reduced. Optional help is closed initially across Restock, Inventory, Reports, Backups, staff access, account information and forecasting. Important import replacement warnings, stock/payment errors, forecast source labels and accuracy remain visible when relevant. Text size and touch targets stay readable; flat borders replace panel shadows.

Ordinary forms now show persistent field-specific feedback, focus the first invalid field and retain entered values after failed requests. This covers required/whitespace-only fields, email format, whole-number ranges and decimal constraints. Supplier/contact/link/email failures remain in their dialog so users can correct or retry the draft. Inventory and sales keep their specific stock and financial validation. API validation uses readable field names; malformed JSON errors do not echo request content. Page error boundaries offer recovery without clearing the offline queue. Stock badges also follow the selected language.

The interaction references are documented in [Design references](DESIGN_REFERENCES.md): Google Material Design, Nielsen’s heuristics, progressive disclosure, Fitts’s Law, Hick’s Law and WCAG error/target guidance. A [phone preview](design-previews/phone-restock.png) shows the compact layout with fictional test data and larger Tagalog text. This redesign requires deploying the current API and website; it adds no new SQL migration.

## Everyday workflow

- **Home:** sale, delivery, and restocking actions appear first. Search opens Inventory with the part name or number already filled in. Running-low and out-of-stock totals open the corresponding inventory filter. Sales charts and less-used insights expand when requested.
- **Navigation:** phones and tablets have short Home, Sell, Stock, Help, and Menu labels; Cashiers see Sell, Stock, Help, and Menu. In Tagalog the selling action is Benta. Full page names are available in the menu. Desktop navigation groups everyday work separately from review and management tools. Store-management links remain restricted by account role.
- **Inventory:** readable cards with part editing and stock corrections, category/stock filters and barcode search. Corrections require a reason and preview the resulting quantity. Cashiers have a read-only view. Sales and deliveries are recorded exclusively in **Sell or receive**, where users tap parts into a basket, check quantities/prices and confirm once. Photo buttons are separate from Add to basket; images fit without cropping.
- **Help:** common questions explain selling, deliveries, and finding parts without needing an AI request. Conversations use a light dialog and readable question buttons. Existing local, saved-record, database, and optional AI behavior is preserved.
- **Planning and restocking:** estimates are explained as a guide, with data limitations visible. Staff can switch between a chart and a daily list. Supplier emails require a recipient-and-quantity review; missing supplier emails can be corrected by an authorized manager.
- **Other screens:** stock history, imports, and backups use mobile cards; reports explain what each file contains. Staff/account/settings controls have proper labels and clearer loading, empty, and failure messages.

## Easier reading and everyday Tagalog

Chat answers now put each part in its own list item, with the exact part number on a separate line and quantities/prices emphasized. Selling and delivery help uses numbered steps. Replies open at their beginning instead of scrolling past the first parts. Offline answers keep the saved-data date and pending-change explanation; record-based and AI sources remain disclosed in the selected language. Only plain text, lists, steps and emphasis are rendered; assistant output cannot insert HTML, images or executable links.

Common Tagalog labels and all assistant layers use familiar store language: stock, benta, order, delivery, supplier and piraso. Everyday questions such as “Ano ang dapat orderin?” and “Ano ang mabenta?” are recognized. Coolant and the radiator remain distinct products, and the same exact part numbers and quantities are retained.

The interface explicitly uses a locally available sans-serif font, increases small text and button labels, improves field borders and separates selected navigation items with a visible edge. **Text and display** opens a simple reading panel with standard/larger text and light/dark choices, saved on the device and available before login. Large text uses an 18-pixel base. Main workflows are checked at 320, 768 and 1440 pixels with large text. Daily forecast averages have a concrete explanation; the quiet sync bar hides its manual-send action when no changes or errors need attention.

## Plain store sign-in

Login uses a single centered form on a solid background, a compact PartCast wordmark and the store name. Password and email-code steps have an active underline. Fields are larger, Show/Hide has a visible label, and the main action appears before resend/change-account links. The email address is read-only once the password session is established, and the six-digit code has its own larger input and instructions. First-account setup uses the same layout. Password verification, required Gmail codes, resend limits, setup requirements and offline session checks remain enforced.

Login styling is scoped to this screen. Light/dark and larger-text preferences remain available before signing in. Input focus uses a clear gray outline, while errors retain red feedback. The production build, 22 web/translation tests and five targeted browser workflows passed; phone, tablet and desktop previews were reviewed, including Tagalog, larger text and the email-code step. Browser checks also verify no gradient backgrounds are present. Updated screenshots are in [design previews](design-previews/README.md).

## Accessibility and responsive behavior

The selling picker now uses two columns on narrow phones and three or four as its own available width grows. Full part names and codes wrap, picture buttons remain separate from Add, and a basket shortcut stays above phone navigation. Missing prices have a clear instruction, quantity/price fields align, and credit payments are rechecked whenever basket amounts change. See [the current validation report](VERIFICATION.md) and [pricing setup](STORE_WORKFLOWS.md).

Controls use at least 44-pixel touch targets, primary fields and buttons generally use 48 pixels, and inputs use 16-pixel text to avoid automatic phone zoom. Text labels accompany actions and stock statuses so meaning does not depend on color. Focus indicators, a skip-to-content link, keyboard-trapped dialogs, Escape closing, focus restoration, and reduced-motion support are included. Optional sections stay open while a user corrects an invalid field.

The offline queue, role restrictions, API routes, and server-side permission checks are retained. Fractional stock projections use the database's two-decimal precision, preventing a remaining quantity such as 0.2 from being incorrectly rejected after selling 0.1 from 0.3.

## Validation and deployment

Run the frontend unit suite, production build, and browser suite from `apps/web`:

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests cover 320-pixel phones, 820-pixel tablets, and 1440-pixel desktops; search/filter shortcuts, quantity validation, dialog focus, password visibility, responsive staff and owner screens, supplier email review, latest-run forecast values, and offline sale replay. They use test-only auth/API fixtures and the production service worker, not a live Supabase database or real email delivery. Automated checks do not replace observing actual store staff using the screens.

The reading update passed 101 server tests, 22 web unit/translation tests and the production build. All 59 browser scenarios passed across the full run and focused rerun: the first run passed 56, and three old-copy assertions were updated to match the new instructions and quieter sync bar, then passed with four reading/focus checks in the seven-case rerun. Screenshots were visually reviewed for phone chat and the desktop inventory with larger text. The Tagalog check also fixed “paubos” being mistaken for “ubos”; low stock and no stock remain distinct.

To make the redesign visible on Render, deploy the branch containing these changes and rebuild the website with the correct public frontend environment variables. The local validation build uses test settings. See [Render connection instructions](RENDER_CONNECTION.md). No live deployment or database migration is performed by these UI changes. Installed users should send pending stock changes before accepting an app update.

Required password-then-Gmail-code login and separate Super Admin IT settings are described in [the activation guide](LOGIN_ROLES_FORECASTING.md).
