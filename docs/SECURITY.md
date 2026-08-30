# Security Design

PartCast handles inventory, supplier, customer-reference, pricing, and transaction data. The default design therefore treats the application as an authenticated internal system.

## Controls implemented

- Supabase Auth handles password sessions and access tokens.
- Public application registration is not used. The first owner is created using a one-time setup secret; later accounts are owner-created.
- Newly created Supabase profiles default to `active = false`. A direct/public signup cannot access PartCast data even if signup is accidentally left enabled.
- Roles: `owner`, `admin`, `inventory_staff`.
- React never receives `SUPABASE_SERVICE_ROLE_KEY`, Brevo API key, setup secret, or cron secret.
- Node validates every protected request token against Supabase Auth and checks the staff profile.
- Supabase Row Level Security is enabled for business tables. Direct browser access still requires an active authorized role.
- Product stock changes use an atomic PostgreSQL function and cannot reduce stock below zero.
- Inventory transaction and demand observation histories are append-only for authenticated users.
- Admin mutations generate an audit record. IP addresses are stored only as HMAC hashes, not raw IP strings.
- Helmet security headers, strict CORS origins, request-size limits, server-side validation, upload-size limits, and rate limiting are enabled.
- Excel uploads are limited to `.xlsx` and 25 MB.
- Backups and XGBoost model files are in private Supabase Storage buckets.
- Backup downloads use five-minute signed URLs.
- Supplier mail uses Brevo's HTTPS REST API; SMTP credentials are not required.
- Automated job endpoints require a separate `X-Cron-Secret`.
- Raw Excel source files are gitignored so customer data is not accidentally pushed to GitHub.

## Deployment hardening checklist

1. Use a **private GitHub repository**.
2. In Supabase Auth settings, disable public user signups.
3. Use unique random values for `SETUP_SECRET`, `CRON_SECRET`, and `IP_HASH_SECRET`.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` only on the Render API service.
5. Configure `FRONTEND_ORIGINS` with exact HTTPS frontend origins; do not use `*`.
6. Verify the Brevo sender/domain and enable SPF/DKIM/DMARC when a domain is available.
7. Do not place customer spreadsheets in the repository. Import them through the protected Import Data page.
8. Review the audit page and deactivate accounts that are no longer needed.
9. Use strong passwords; enable additional Supabase Auth controls available to your project before a wider rollout.
10. Periodically test backup restore by opening a downloaded Excel backup and checking products, transactions, suppliers, and forecasts.

## Free-tier note

Free hosting is appropriate for a capstone, pilot, or low-traffic internal demonstration, but free providers impose resource, inactivity, storage, and availability limits. Before relying on PartCast for uninterrupted day-to-day business operations, review the current provider limits and consider a paid production plan/SLA.
