# Light, task-focused PartCast interface

The interface is designed around the tasks store staff perform every day: find a part, record a sale, receive a delivery, and check what needs restocking. White surfaces, a light gray background, and solid red accents replace the dark navigation and sign-in screens. No gradients are used.

## Everyday workflow

- **Home:** sale, delivery, and restocking actions appear first. Search opens Inventory with the part name or number already filled in. Running-low and out-of-stock totals open the corresponding inventory filter. Sales charts and less-used insights expand when requested.
- **Navigation:** phones and tablets have visible Home, Parts, Restock, Help, and More buttons. Desktop navigation groups everyday work separately from review and management tools. Store-management links remain restricted by account role.
- **Inventory:** readable cards on phones and tablets, labeled actions, visible stock filters, and a clear three-step guide. Stock forms ask for quantity first, preview the result, and put receipt, price, and note fields in an optional section. Invalid inputs receive a nearby explanation and keyboard focus. Quantities and prices match database precision.
- **Help:** common questions explain selling, deliveries, and finding parts without needing an AI request. Conversations use a light dialog and readable question buttons. Existing local, saved-record, database, and optional AI behavior is preserved.
- **Planning and restocking:** estimates are explained as a guide, with data limitations visible. Staff can switch between a chart and a daily list. Supplier emails require a recipient-and-quantity review; missing supplier emails can be corrected by an authorized manager.
- **Other screens:** stock history, imports, and backups use mobile cards; reports explain what each file contains. Staff/account/settings controls have proper labels and clearer loading, empty, and failure messages.

## Accessibility and responsive behavior

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

To make the redesign visible on Render, deploy the branch containing these changes and rebuild the website with the correct public frontend environment variables. The local validation build uses test settings. See [Render connection instructions](RENDER_CONNECTION.md). No live deployment or database migration is performed by these UI changes. Installed users should send pending stock changes before accepting an app update.
