# PartCast verification

This report describes local checks for the bilingual store-workflow update. Test records use synthetic products, suppliers, and customers; no customer sales workbook was newly published.

## Application and database checks

- Production Vite build completed and generated the installable PWA/service worker.
- Server suite: **27 tests passed**, including actual PostgreSQL execution through PGlite with Supabase Auth/Storage scaffolding.
- Frontend unit suite: **14 tests passed**, including account isolation, persistent outbox/retries, decimal arithmetic, Tagalog terminology, and complete explicit interface-translation key coverage.
- Production dependency audit: **0 known vulnerabilities** reported for each Node package at the time of this check. This is not a comprehensive security audit.

Database checks execute migrations 0001–0005 and verify active-account reads, direct-write denials, stock conflicts, stable retry IDs, atomic multi-item credit sales, payment history, overpayment/precision checks, existing past-due customer balances, stock notifications, and supplier job leases. HTTP checks verify validation before RPC and propagation of the staff token to the authenticated database function.

Server tests generate/reopen real Excel reports to check date boundaries, exact totals and current-stock labels. Image tests decode real JPEG/PNG/WebP bytes, reject invalid/disguised files, enforce bounds, and verify re-encoding/metadata removal. Supplier email tests verify exact edited quantities, HTML escaping, cooldown and lease behavior without sending a real email.

## Browser checks

Chromium tests run against the production build with mocked Supabase/Auth/API services. They cover phone, tablet and desktop layouts; numbered sale/receive forms; labels and keyboard focus; offline reload/reconnect and account cleanup; multi-item credit sales; partial payments and overpayment refusal; category filters; known/unknown barcode entry; camera permission failure/manual fallback; private-photo upload/gallery/cache/removal; bilingual/dark preferences; supplier draft edits; actual Excel download handling; and email-code expiry/success without public signup.

The final browser suite completed with **30 tests passed**. Together with the server and frontend suites, **71 local tests passed**. API mocks do not establish that the hosted database, Render service, SMTP provider or a physical barcode camera is configured.

## Forecasting interpretation

Earlier metrics from the supplied training-ready workbook preceded fixes to demand leakage and data-coverage handling. They must not be used as current production accuracy claims. The original workbook includes inferred/proxy quantities. The raw-data review recovered actual quantities, but the eligible histories remain too old for a current forecast. Current training refuses stale/future histories rather than reporting unsupported current predictions.

See [Forecasting data](FORECASTING_DATA.md) for provenance, eligibility and historical holdout limitations. Python forecasting code was unchanged by this store-workflow update; this report does not claim a new model training run.

## Live activation checks

Apply only unapplied migrations through 0005, configure the Supabase numeric-code email template, and deploy both Render services from the saved branch. Follow [Activate and use the new features](STORE_WORKFLOWS.md).

After activation:

1. Check API `/health`, then sign in and confirm **Inventory saved**.
2. Request and verify an email code for an existing active staff account.
3. On test records, save a multi-item sale/delivery and a credit sale; record a partial payment and check the remaining balance.
4. Save an offline sale, reconnect, and confirm it appears exactly once.
5. Upload/view photos, scan a known barcode on the actual device, and test manual entry.
6. Review an edited supplier email and verify delivery to a controlled test supplier address.
7. Download a dated sales report and compare its gross totals with the test sales.

No hosted Supabase migration, Render deployment, real staff/supplier email delivery, or physical-camera accuracy was verified during local implementation.
