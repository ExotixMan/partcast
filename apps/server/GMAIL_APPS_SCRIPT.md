# Gmail through Google Apps Script

This optional HTTPS transport sends login codes and reviewed supplier emails using an owner-deployed Google Apps Script and `MailApp`. It works with Render Free and does not require a custom sending domain, SMTP ports or an IP allowlist. It does not reuse the Google Cloud OAuth client undergoing public branding review. The sending account must still authorize its own script, and Google account/Workspace security policy can prevent authorization or anonymous web-app deployment. Activation and a real received code must be checked in the user's account; this release does not guarantee Google approval or delivery.

The public, login-independent setup guide is `/email-setup/`. It includes a Copy script button, a direct `Code.gs` download and a device-local random key generator. The canonical script source is `apps/web/public/email-setup/Code.gs`; do not maintain a divergent copy.

## Owner setup

1. Sign in to Google Apps Script as the sending Gmail account. Create a new project, replace `Code.gs` with the supplied script, and save.
2. Generate a random 32-byte key privately. The guide's generator uses `crypto.getRandomValues`, does not persist the key and does not send it to a server. Store the same value as Script property `PARTCAST_MAIL_SECRET` and API environment variable `GMAIL_APPS_SCRIPT_SECRET`.
3. Run `authorizePartCast` in the script editor and authorize this owner-controlled project. It reads the effective sender identity and remaining email quota without sending a message. The script uses `MailApp`, not Gmail inbox access. If Google completely blocks owner authorization, stop and resolve that account restriction; the script cannot bypass it.
4. Deploy a Web app: Execute as **Me**, access **Anyone**. Use its deployed `/exec` URL. Access requests still require a valid signature; do not deploy an unsigned mail relay.
5. Configure these API environment variables privately, then save/redeploy:

```text
GMAIL_DELIVERY_METHOD=apps_script
GMAIL_SENDER_EMAIL=your-sending-account@gmail.com
GMAIL_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
GMAIL_APPS_SCRIPT_SECRET=<the-matching-private-random-key>
```

6. If saved Gmail settings still override the environment and sign-in is blocked, first configure the replacement above, wait until the API is Live, then remove only the Gmail override using the existing Supabase project SQL Editor:

```sql
delete from public.integration_settings where provider = 'gmail';
```

Wait 20 seconds for cached settings to expire, then request a code once and verify receipt. Business records, staff accounts, Gemini settings and encryption keys remain unchanged. No schema migration is required. A signed-in Super Admin can instead choose **Gmail via Apps Script** in IT settings. Saving first performs a signed check without sending email; secrets stay encrypted, are represented only by presence flags and clear from the form after success. A failed check preserves the previous saved connection. Existing saved OAuth/SMTP settings keep their original mode; there is no automatic fallback.

## Security and delivery behavior

The API only accepts a deployed HTTPS `script.google.com/macros/s/.../exec` URL. Each POST signs an encoded payload with HMAC-SHA256 and includes a UUID, sender identity and five-minute timestamp window. The shared key is never placed in the URL or transmitted as a field. The script validates the signature before decoding and using email data, enforces one recipient per message, checks the executing sender and validates text/header limits. Endpoint responses contain controlled codes only; neither endpoint logs message bodies, codes, signatures or credentials.

A Google script lock serializes sends. Before calling `MailApp.sendEmail`, the script stores a pending request marker. Replaying the same signed request after success returns the original acceptance without another send. An interrupted/failed submission stays uncertain and is never resubmitted for that ID. Reusing an ID with different payload data is rejected. Metadata holds only signature, state and timestamp; it does not persist recipients, subjects, message bodies or OTPs. Records expire after 48 hours, outside the signed-request validity window, and are capped at 500. Existing supplier-request database receipts and uncertain-send protections remain in force. HTTP failures or unreadable replies during sending are conservative uncertain results; known authentication/configuration/quota failures are definite rejections. No automatic HTTP retry occurs.

Fetches time out after 20 seconds; the login request permits 45 seconds and settings requests permit 30 seconds. Signature verification prevents unauthorized mail, but public deployments still consume execution resources when accessed; this route is suitable for a small controlled store, not an unrestricted bulk mail service.

A standard consumer Google account typically permits 100 recipients per day through Apps Script; limits depend on account and Google's current quota policy. Sign-in codes and supplier requests share the allowance. See <https://developers.google.com/apps-script/guides/services/quotas>. `MailApp` does not return a Gmail message ID or guarantee a Gmail Sent copy, so the stored provider reference identifies the relay submission. Acceptance does not prove recipient delivery. Supplier recovery should check PartCast's request status or contact the recipient; do not rely exclusively on Gmail Sent.

Updating source in the editor does not update an existing production deployment: use Manage deployments, Edit, New version, Deploy. To revoke access, archive the deployment, remove its Google account grant and remove or replace the signing key. Preserve the original PartCast encryption key. Tests run the supplied script with isolated fake Google services and mocked HTTP; they send no actual emails or live OTP requests.
