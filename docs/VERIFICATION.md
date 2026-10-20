# Verification — 20 October 2026

The final local run passed **302 automated checks**: 138 server/database tests, 26 website unit tests, 85 Chromium browser scenarios and 53 Python forecasting tests. The production Vite/PWA build passed. Both application runtime dependency audits reported zero known vulnerabilities at audit time; dependency declarations and lockfiles were unchanged.

## What was checked

Server checks execute PostgreSQL migrations through 0012 with PGlite. They cover fresh installation, original-schema upgrade, repeat execution, preserved records, required password-session email verification, account roles, direct-write restrictions, atomic stock/credit operations and retry receipts. New financial cases reject zero-cent sale lines, mismatched supplied totals, altered quantities/totals and excessive values; failure rolls back stock, demand, batches and customer credit together. Missing totals are calculated, free stock receipts remain allowed, and cash or fully paid sales ignore unused due-date fields.

HTTP security tests cover rate limits before request parsing, malformed/oversized requests, denied CORS origins, no-store headers, example-secret rejection at production startup, OTP throttling, session binding, role denial and masked/encrypted Google settings. Search tests pass operator-like strings, punctuation, percent signs, underscores, backslashes and Tagalog through the literal-filter builder and execute matching against PostgreSQL. Paging and filter tests reject invalid values before database reads. No reproducible SQL injection was found in these checks; this is not a guarantee against every attack or a comprehensive external penetration test.

Business checks cover complete payment history and category-filtered exports, Restock thresholds and one-to-two-unit suggestions, supplier changes, editable email drafts, duplicate-safe retries and sending-result recovery. Forecast jobs preserve deterministic ordering past 1,000 tied observation dates and stop on failed run creation.

Browser scenarios cover password plus email code, role-specific pages, sales/receipts, prices, customer credit, partial payments, offline retries/account isolation, photos, barcode/manual fallback, imports, reports, notifications and all application pages. Layout checks include phone, tablet, desktop, larger text, English/Tagalog and dark mode. New scenarios cover mixed baskets containing a zero-cent line, free receipts, outstanding versus fully paid credit dates, stale catalog/payment responses, report category forwarding, and mobile notifications that leave Save accessible and dismiss after success.

The Python suite checks chronological forecast boundaries, sparse/old history, missing-data handling, source restrictions, baseline comparisons, simulation reproducibility and validation isolation. The seeded labelled test database ran the authenticated Node-to-Python XGBoost pipeline locally. These checks establish runtime behavior, not actual-store forecast accuracy. No new actual-store WAPE was measured in this audit.

Explanatory source comments were removed using parser/token offsets, preserving executable tokens, Python ASTs, required shebangs, strings and provenance values. Generated SQL was rebuilt and exercised by the installation tests. Tests now generate their own fresh setup ZIP and use a local simulated fixture instead of depending on archived downloads.

## Delivery and limits

The production tree contains application source, assets, deployment configuration, migrations, tests and maintainer guides. The separate private archive preserves 98 removed repository files and 20 original uploads with per-file SHA-256 checksums. It includes the uploaded SQL backup and must remain private. Current-tree cleanup does not erase older Git commits. No history rewrite was performed.

The user confirmed both Render services use `production`. Source changes are prepared for that branch; Render status and deployed response headers still need independent confirmation. Manually configured Render static sites must receive the security-header rules from `render.yaml`; the YAML alone does not update their dashboard settings.

Live requests from this workspace were blocked by the cloud network proxy with CONNECT 403 / tunnel connection failure. No current live sign-in, OTP delivery, database migration, import, forecast, supplier email, or business-data mutation was performed. Physical camera performance and actual Gmail delivery were not established by mocked browser/provider tests. A passing suite cannot guarantee zero future bugs or an impenetrable system.

## Activate this release

A store through 0011 must apply [0012_sale_financial_integrity.sql](../supabase/migrations/0012_sale_financial_integrity.sql) in Supabase SQL Editor after a backup. Older stores must apply their missing migrations in order. The complete two-part installer includes the upgrade; a reset/reimport is unnecessary. Production database changes were excluded by the user's read-only instruction.

Confirm both Render services deploy the final `production` commit. Follow [Deployment](DEPLOYMENT.md) for Python/Gmail settings, static headers and exact frontend/API origins. Confirm API health, sign-in and email-code delivery, role restrictions, inventory/notification loading and source-matching report totals. Use a separate test project for invented sales, credit payments, imports, emails and offline synchronization checks.
