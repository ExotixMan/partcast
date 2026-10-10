# PartCast verification

This report describes local checks for required Gmail login codes, store roles, simpler inventory/sales workflows, and the forecasting runtime repair. Test records use synthetic products, suppliers, and customers; no customer sales workbook was newly published.

## Application and database checks

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

The final browser suite completed with **35 tests passed**. Together with the server, frontend and Python suites, **102 local tests passed for the application release**. API mocks do not establish that the hosted database, Render service, Gmail/Brevo provider or a physical barcode camera is configured.

## Complete paste-ready SQL follow-up

The [complete SQL bundle](../supabase/paste-ready/README.md) has **11 additional PostgreSQL checks passed** in `apps/server/tests/paste-sql.test.js`. They execute both complete files on a fresh Supabase-scaffolded database, upgrade the original 0001–0003 schema, repeat both files, and verify that inventory, photos, credit sales, payments, account roles, session verification, encrypted connection records and retry receipts survive. They also verify denied password-only access, direct stock edits and truncation, a pause in business-table access between files, rollback on an unrelated/incomplete schema, and exact-account Super Admin promotion with absent/duplicate-email rejection. These files were not applied to hosted Supabase during preparation.

## Forecasting interpretation

Earlier metrics from the supplied training-ready workbook preceded fixes to demand leakage and data-coverage handling. They must not be used as current production accuracy claims. The original workbook includes inferred/proxy quantities. The raw-data review recovered actual quantities, but the eligible histories remain too old for a current forecast. Current training refuses stale/future histories rather than reporting unsupported current predictions.

The server launcher was tested with the exact invalid Windows executable path from the reported ENOENT error and an invalid copied script path. It detected this project's installed Python packages and bundled script, trained XGBoost on two synthetic parts with 120 days of recent actual-quantity observations, returned 14 daily estimates, historical/baseline metrics, and a model artifact. A separate real process rejected stale or insufficient observations with a readable data-quality error. These checks establish runtime and pipeline behavior, not accuracy on the store's uploaded histories. A native Windows execution was not available.

See [Forecasting data](FORECASTING_DATA.md) for provenance, eligibility and historical holdout limitations. Forecasting uses the Philippines calendar day for current training and sales observations. Recent actual sales are still required for useful current predictions.

## Live activation checks

Configure Gmail OAuth on the API before deploying required codes. Use matching Supabase project keys, apply only unapplied migrations through 0007 (0006 and 0007 in separate committed executions), promote the intended IT account to Super Admin, and deploy both Render services from the saved branch. Follow [Required login, access roles, and forecasting upgrade](LOGIN_ROLES_FORECASTING.md). The workspace had mismatched frontend public/server service-role keys and no supplied Gmail OAuth credentials, so live activation remains incomplete.

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
