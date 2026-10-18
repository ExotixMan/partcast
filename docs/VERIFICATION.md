# PartCast verification

This report describes local checks for required Gmail login codes, store roles, simpler inventory/sales workflows, the forecasting runtime repair and the subsequent Restock/Gmail supplier-table update. Test records use synthetic products, suppliers, and customers; no customer sales workbook was newly published.

## Supplier email part picker — 18 October 2026

Full server suite: **111 passed**. Web unit/translation suite: **26 passed**. Production Vite/PWA build passed. **6 focused browser scenarios passed**, covering existing custom email columns/previews, stock refresh, failed email sends, the empty-picker inventory fallback, supplier-part lookup retry, duplicate prevention, explicit supplier saves and recovery, paginated search, retained drafts and 320-pixel Tagalog layouts. The full browser suite was not rerun for this isolated fix.

Server checks exercise secondary-supplier parts that are already in stock, correct email recipients, exclusion of inactive/unlinked parts, rejection before Gmail delivery, role restrictions and invalid IDs before supplier writes. Duplicate-safe supplier linking preserves existing main suppliers, supplier prices and delivery settings. A catalog with more than 1,000 assignments exercises pagination and bounded PostgREST product queries. All checks use local fixtures; no live store data was changed and no real email was sent. Deploy both services as described in [Store workflows](STORE_WORKFLOWS.md).

## Compact interface, Restock filters and consistent validation — 18 October 2026

Full server suite: **106 passed**. Web unit/translation suite: **26 passed**. Production Vite/PWA build passed. All **70 browser scenarios** passed across the full run and focused rechecks: the full run passed 66, loading assertions were corrected to distinguish the new result-count announcements from spinners, and the existing Counter sales translation was retained. The 11-case recheck passed the four affected scenarios and Restock workflows. Final focused checks also passed after compacting phone headers/help and correcting shared stock-badge translation.

New checks cover combined part/name/supplier search, stock and unassigned-supplier filters, clearing filters, distinct empty/no-match states, independent supplier-contact searches, preserved filters after refresh, and saved offline Restock searches. The API check returns all 1,001 fixture records across two pages, rather than stopping at Supabase’s first 1,000. Invalid supplier IDs stop before database reads. Filtering preserves purchase quantities and forecast totals.

Form checks cover whitespace-only names, email errors, cost/delivery bounds, external settings-submit buttons, focusing/marking invalid fields, retaining entries after supplier/link/email failures and retrying a draft. API tests verify readable field names and rejection of malformed JSON without echoing private request content. An intentionally malformed page response exercises the recovery screen and then successfully reloads the page while navigation remains available. Existing offline sales, credit, required email-code login, role restrictions, forecasting, imports, exports, notifications and photo workflows are included in the broader browser run.

Phone, tablet and desktop checks include 320-pixel layouts and larger Tagalog text. The final phone preview was visually reviewed. Optional help is collapsed initially; import replacement warnings and forecast provenance/accuracy remain available in their existing flows. These are local synthetic fixtures, not a live Render deployment, actual staff usability study or full accessibility certification. Design sources and their application are listed in [Design references](DESIGN_REFERENCES.md).

## Mobile selling, pricing and utang — 18 October 2026

Full server suite: **103 passed**. Web unit/translation suite: **23 passed**. Production Vite/PWA build passed. All **65 browser scenarios** passed across the full run and focused recheck: the full run passed 62, three outdated navigation/login/basket selectors were corrected, and the final 12-case run passed those cases plus pricing, credit, offline and photo checks. The final build also includes aligned quantity/price fields and photo labels that wrap inside narrow cards.

Browser checks cover two-column phone cards at 320/390 pixels, three columns at 1280 pixels, four columns at 768/1440 pixels, and short phone navigation in English/Tagalog. Larger-text Tagalog checks include a saved part photo and the credit-payment form, with no horizontal overflow. The basket shortcut is checked above phone navigation, and full-page navigation retains keyboard focus handling and account permissions.

Financial checks verify missing/null/zero prices block new sales, an Owner can explicitly save a positive catalog price, a per-sale price change preserves the catalog, and a Cashier cannot save catalog prices. Reducing prices or removing items rechecks the payment and displays an unavailable balance with an actionable warning instead of negative utang. Valid partial payments retain centavo precision. Offline credit sales reconnect exactly once; zero-cost deliveries remain possible. Real PostgreSQL checks exercise migration 0010, unpriced direct-RPC rollbacks, basket atomicity, overpayment rejection, payment locking and safe retries. Complete and fresh-install SQL/ZIP checks also pass.

These are local checks with fictional accounts and API fixtures, not a live Render or Supabase deployment. Existing store data was not changed. Apply the small migration and deploy both services as described in [Store workflows](STORE_WORKFLOWS.md).

## Model integrity follow-up — 14 October 2026

Full server suite **47 passed**, Python suite **26 passed**, frontend unit suite **17 passed**, production Vite/PWA build passed. The three affected Node ML tests were rerun after the final output-guard change. These counts replace the corresponding earlier suite counts for this revision; browser flows were not rerun for translated error strings.

Input checks now reject unidentified sales, invalid dates, boolean/nonfinite/negative quantities. Returned forecasts must use identified input parts and contain exactly the full future horizon, with unique dates and truthful product/horizon counts; malformed outputs are rejected before storage. Tests include real Python training, candidate selection unchanged by altered synthetic final-period labels, and refusal to rank candidates from zero-demand development periods.

The current Tweedie and two regularized XGBoost candidates were compared on pre-final-period data only. No development period has positive recorded demand, so no winner or high-accuracy result is asserted and production parameters remain unchanged. Original workbooks and the accepted 757-row/709-part extract retain their SHA-256 fingerprints. See [model improvement review](MODEL_IMPROVEMENT_REVIEW.md). No new part, hosted import, deployment or SQL migration was created.

## Prediction follow-up — 12 October 2026

Full server suite **46 passed**; standalone Python suite **22 passed**; frontend unit suite **17 passed**; targeted Chromium planning/responsive suite **7 passed**; production Vite/PWA build passed. These counts are separate from the earlier releases below; targeted suites overlap existing coverage and should not be added to old full-suite totals.

Regression checks verify that older forecast runs cannot mix into/truncate a latest 90-day chart, Cashier restrictions still apply, and malformed IDs are rejected. Python checks show that each part retains its own recursive lag history during batched prediction, invalid model outputs are rejected, eligibility uses only pre-origin records, and changing future holdout quantities cannot alter that period's model fit or predictions. Browser checks display small errors accurately, full-period quantity error and recorded/predicted totals, missing tests and undefined zero-demand percentages on phone/tablet/desktop layouts.

A separate real synthetic 12-part/200-day training case generated 1,080 future 90-day estimates plus a real model artifact in about 2.0 seconds. It is a runtime demonstration, not store accuracy. The actual uploaded quantity history was reprocessed without modifying originals and independently rejected by the current-date training gate as stale, without a model/forecast artifact. Its application-matching 30-day historical WAPE is **100.0345%**: **40 recorded units versus 0.0138 predicted**. There are zero fresh eligible parts. See [prediction accuracy and defense readiness](PREDICTION_READINESS.md) for all metrics, date coverage, data limitations and reimport steps.

Neither Render origin could be reached through the workspace HTTPS proxy (403 CONNECT denial). The cloud's mismatched project keys and too-short private encryption key remain setup blockers; they do not establish Render's configuration. No hosted import, migration, model training or deployment was performed. The new prediction metrics use the existing JSONB column and need no additional SQL migration.

## Latest Restock and Gmail update

- Full server suite: **45 passed**, including the complete SQL installer checks, real PostgreSQL migration 0008 execution and the existing Node-to-Python forecasting checks.
- Frontend unit suite: **17 passed**; production Vite/PWA build completed.
- Targeted Chromium suite: **5 passed**, covering planning/email review, edited supplier quantities/messages, mobile custom columns and extra supplier parts, column removal, Restock refresh after stock changes, and stock-notification retries. The full browser and standalone Python suites below belong to the earlier release and were not rerun for this supplier-table update.

The database checks verify that stock exactly at its minimum and zero stock with a zero minimum both remain visible for restocking, healthy stock has no forced suggestion, and repeating migration 0008 preserves stock. Gmail provider tests mock Google OAuth/message APIs, check the HTML and plain-text alternatives, custom-field escaping, authorized recipient, and Gmail message IDs. No real email was sent. Tests use an isolated fake encryption key because the cloud's currently injected dedicated key is shorter than the required 32 characters; application startup retains that validation. Repair the private cloud setting before using its live API, preserving the key previously used for saved encrypted connections.

An isolated startup check launches the actual Express server, checks `/health`, invokes its registered automatic email timer with provider/database mocks, verifies Gmail delivery of an exact-threshold request and lease release, then verifies that disabling the store setting prevents another send. No old email-provider variables are present in that check.

See [upgrade instructions and stock-field guidance](RESTOCK_GMAIL.md). Existing stores with 0001–0007 need only migration 0008; the regenerated complete SQL bundle includes it for full installation.

## Earlier application and database checks

- Production Vite build completed and generated the installable PWA/service worker.
- Server suite: **33 tests passed**, including actual PostgreSQL execution through PGlite with Supabase Auth/Storage scaffolding and real Node-to-Python model training.
- Frontend unit suite: **17 tests passed**, including verified-session binding, role permissions, account isolation, persistent outbox/retries, decimal arithmetic, Tagalog terminology, and complete explicit interface-translation key coverage.
- Python suite: **17 tests passed**, covering forecasting data eligibility, historical evaluation, and import cleaning.
- Production dependency audit: **0 known vulnerabilities** reported for each Node package at the time of this check. This is not a comprehensive security audit.

Database checks execute migrations 0001–0007, committing the role-enum migration separately. They verify required password authentication and session-bound email verification for tables and direct RPCs; code expiry, resend delay, five-attempt limits and retry behavior; private integration tables; active-account reads; Cashier workflow restrictions; direct-write denials; stock conflicts; stable retry IDs; atomic multi-item credit sales; payment history; overpayment/precision checks; existing past-due customer balances; stock notifications; and supplier job leases. Sales keep their charged price on the transaction without changing catalog selling prices or purchase costs. Deliveries update purchase cost. The affected database suite was also rerun after this pricing check.

HTTP checks verify authentication failure handling, validation before RPC, and propagation of the staff token to the authenticated database function. Gmail tests mock Google OAuth and message delivery while checking the authenticated recipient, six-digit codes, and stored code hashes. Integration tests cover encrypted secret storage, masked responses, blank-field preservation, mandatory Gmail configuration, and Super Admin-only settings. Owner and Cashier access is checked independently of hidden navigation.

Server tests generate/reopen real Excel reports to check date boundaries, exact totals and current-stock labels. Image tests decode real JPEG/PNG/WebP bytes, reject invalid/disguised files, enforce bounds, and verify re-encoding/metadata removal. Supplier email tests verify exact edited quantities, HTML escaping, cooldown and lease behavior without sending a real email.

## Browser checks

Chromium tests run against the production build with mocked Supabase/Auth/API services. They cover phone, tablet and desktop layouts; dedicated sale/receive baskets and inventory corrections; required password followed by email code; wrong passwords/codes; Owner/Cashier/Super Admin navigation; labels and keyboard focus; offline reload/reconnect and account cleanup; an offline sale surviving expired verification and sending exactly once after a new code; multi-item credit sales; partial payments and overpayment refusal; category filters; known/unknown barcode entry; camera permission failure/manual fallback; uncropped photos and sale-page galleries; private-photo upload/gallery/cache/removal; bilingual/dark preferences; supplier draft edits; stock-alert refresh/read failures; and actual Excel download handling.

The earlier full browser suite completed with **35 tests passed**. Together with the server, frontend and Python suites, **102 local tests passed for that application release**. API mocks do not establish that the hosted database, Render service, Gmail provider or a physical barcode camera is configured.

## Complete paste-ready SQL follow-up

The [complete SQL bundle](../supabase/paste-ready/README.md) has **11 additional PostgreSQL checks passed** in `apps/server/tests/paste-sql.test.js`. They execute both complete files on a fresh Supabase-scaffolded database, upgrade the original 0001–0003 schema, repeat both files, and verify that inventory, photos, credit sales, payments, account roles, session verification, encrypted connection records and retry receipts survive. They also verify denied password-only access, direct stock edits and truncation, a pause in business-table access between files, rollback on an unrelated/incomplete schema, and exact-account Super Admin promotion with absent/duplicate-email rejection. These files were not applied to hosted Supabase during preparation.

## Forecasting interpretation

Earlier metrics from the supplied training-ready workbook preceded fixes to demand leakage and data-coverage handling. They must not be used as current production accuracy claims. The original workbook includes inferred/proxy quantities. The raw-data review recovered actual quantities, but the eligible histories remain too old for a current forecast. Current training refuses stale/future histories rather than reporting unsupported current predictions.

The server launcher was tested with the exact invalid Windows executable path from the reported ENOENT error and an invalid copied script path. It detected this project's installed Python packages and bundled script, trained XGBoost on two synthetic parts with 120 days of recent actual-quantity observations, returned 14 daily estimates, historical/baseline metrics, and a model artifact. A separate real process rejected stale or insufficient observations with a readable data-quality error. These checks establish runtime and pipeline behavior, not accuracy on the store's uploaded histories. A native Windows execution was not available.

See [Forecasting data](FORECASTING_DATA.md) for provenance, eligibility and historical holdout limitations. Forecasting uses the Philippines calendar day for current training and sales observations. Recent actual sales are still required for useful current predictions.

## Live activation checks

Configure Gmail OAuth on the API before deploying required codes and supplier email. Use matching Supabase project keys, apply only unapplied migrations through 0008 (0006 and 0007 in separate committed executions), promote the intended IT account to Super Admin, and deploy both Render services from the saved branch. Follow [Required login, access roles, and forecasting upgrade](LOGIN_ROLES_FORECASTING.md). Hosted credentials, encryption-key continuity and actual Gmail delivery still require private configuration and live verification; local test credentials do not establish hosted activation.

After activation:

1. Check API `/health`, then sign in and confirm **Inventory saved**.
2. Sign in with a password, then verify the Gmail code for an existing active staff account. Confirm Owner/Cashier restrictions and Super Admin-only IT settings.
3. On test records, save a multi-item sale/delivery and a credit sale; record a partial payment and check the remaining balance.
4. Save an offline sale, reconnect, and confirm it appears exactly once.
5. Upload/view photos, scan a known barcode on the actual device, and test manual entry.
6. Review an edited supplier email and verify delivery to a controlled test supplier address.
7. Download a dated sales report and compare its gross totals with the test sales.
8. Check the forecasting engine and train with eligible recent actual sales; review historical metrics against the baseline before using estimates for buying decisions.

No hosted Supabase migration, Render deployment, real staff/supplier email delivery, or physical-camera accuracy was verified during local implementation.
