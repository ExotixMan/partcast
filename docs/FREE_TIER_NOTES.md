# Free-Tier Notes (August 2026)

PartCast is intentionally deployable without a paid hosting plan for capstone/pilot use, but "free" does not mean guaranteed 24/7 production availability.

- **Render Free Web Service**: suitable for testing/hobby/preview use; it can spin down after 15 minutes without inbound traffic and cold-start on the next request. Render currently grants 750 free instance hours per workspace/month. The local filesystem is ephemeral, so PartCast never stores long-lived business data there.
- **Render Static Site**: used for the React frontend and is free to deploy, subject to workspace bandwidth/build limits.
- **Supabase Free**: currently includes 500 MB database size and 1 GB Storage. Platform-managed automatic database backups are not included on Free, which is why PartCast creates private Excel application backups.
- **Brevo Free transactional email**: currently supports 300 sends/day. PartCast groups reorder items by supplier so one supplier normally receives one replenishment message per changed recommendation set.
- **Render SMTP restriction**: free web services cannot send outbound traffic on ports 25, 465, or 587. PartCast therefore calls Brevo's HTTPS REST API rather than SMTP.

Before the beneficiary relies on PartCast for uninterrupted daily operations, review the providers' current limits and upgrade hosting if an uptime/SLA requirement becomes necessary.
