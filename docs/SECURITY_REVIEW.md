# Security and validation review — 2 November 2026

This review covers the staged application release and its automated tests. It does not certify the live Google account, production secrets, database ownership, or every possible attack.

## Changes

- Reject boolean, array, empty and fractional values for integer store settings.
- Reject unsupported control characters in JSON and imported text; bound JSON nesting and item count before application routes.
- Validate record UUIDs before product, forecast and account database operations.
- Retain the current authenticated Supabase Realtime subscription, cross-tab invalidation and automatic XGBoost training. Live messages trigger authorized API reads; user-provided row payloads are not displayed directly.
- Refresh customer balances while preserving a payment draft, preventing an outdated form from using an older remaining balance.
- Allow an in-flight background query to finish before polling again. Actual data changes and filter changes still invalidate older requests immediately.
- Preserve operation IDs for interrupted sales and delivery retries, stock limits, delivery review, five-unit warnings and the 100-unit receiving limit.
- Rename English customer balance labels and spreadsheet headings consistently; remove unnecessary application comments.

## Dependency audit

The initial production audit reported eight moderate advisories in ExcelJS's archiver/glob/minimatch chain (GHSA-g3hv-75wg-m249). The release keeps ExcelJS 4.4 and updates its ZIP dependencies together through npm overrides: glob 14, minimatch 11 and unzipper 0.12.5. The lockfile pins the tested resolutions.

A minimatch-only override would break glob 7 because it expects older RegExp internals. Updating the related packages together preserves the archive APIs used here; compatibility tests verify filename glob exclusions, ZIP contents and a streaming Excel export/re-import.

After these changes, `npm audit --omit=dev` reports **zero known production dependency vulnerabilities** for both the website and API. This describes the advisories available at review time.

## Verification

Server tests cover permissions, verified sessions, OTP limits, search injection, numeric and date boundaries, photos and spreadsheet limits, immutable transaction retries, and live update access. Browser tests cover cross-tab sales and deliveries, first-character suggestions, customer payments, offline behavior, mobile layouts and the demand summary calculation.

Tests use fake accounts and mocked mail/HTTP services. No staff codes or supplier emails are sent, and no production transactions are created by the checks.

Release checks: 186 API tests, 29 website unit tests, 7 live-data unit tests and 98 distinct Chromium workflow checks passed. The automatic-status check also passed separately with an 18-second response, crossing its 15-second polling interval without cancelling the in-flight request. Vite/PWA production build and both production dependency audits passed.
