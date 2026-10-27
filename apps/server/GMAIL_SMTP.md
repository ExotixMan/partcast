# Gmail SMTP with a Google App Password

Gmail SMTP sends the same required sign-in codes and staff-reviewed supplier requests as Gmail API. Only the selected connection is used; delivery failures never automatically switch to another connection. This update needs no SQL migration.

## Hosting requirement

The API must run on a host that allows outbound `smtp.gmail.com:465`. **Render Free blocks SMTP ports**, so direct Gmail SMTP cannot work on the current Free API instance. Use a suitable paid API instance or another SMTP-capable host. The website can remain free. No hosting plan or billing setting is changed by this release.

## Configure while signed in

1. Enable Google 2-Step Verification on the sending account, then create an App Password at <https://myaccount.google.com/apppasswords>. Availability depends on Google's account and administrator settings.
2. Open PartCast **IT settings** as Super Admin.
3. Select **Gmail SMTP (App Password)** under **Email connection**.
4. Enter the sending address and its 16-character App Password. Spaces copied between Google's groups are accepted. Use an App Password, not the account's ordinary password.
5. Choose **Check and save connection**. The API verifies TLS/authentication without sending an email, then encrypts and saves the credentials. A failed check preserves the previous configuration. Secret fields clear after a successful save; leaving a saved secret blank preserves it.
6. Complete a controlled password-and-email-code sign-in to confirm real delivery. Connection checks alone do not establish delivery.

Only Super Admin can read connection presence flags, save settings or run the connection check. Secrets stay on the server and are not returned by these endpoints. App Passwords are broader account credentials than the OAuth `gmail.send` scope; protect them and revoke unused passwords through Google Account settings.

## Configure through the API environment

Set these privately on the API service, then restart it:

```text
GMAIL_DELIVERY_METHOD=smtp
GMAIL_SENDER_EMAIL=your-sending-address@gmail.com
GMAIL_APP_PASSWORD=<your-16-character-Google-App-Password>
```

OAuth remains the default for compatibility. SMTP environment mode does not require OAuth client credentials. Saved PartCast Gmail settings override these fallback values; older saved Gmail records remain OAuth until explicitly changed.

If an old saved Gmail connection prevents login, first supply correct environment credentials on an SMTP-capable host. A trusted project administrator can then remove only the saved override in Supabase SQL Editor:

```sql
delete from public.integration_settings where provider = 'gmail';
```

This removes saved Gmail connection credentials so the API can use its environment values. It preserves business records and Gemini settings. Existing encryption keys must remain unchanged. Do not use this recovery before configuring a working replacement; blocked SMTP or an invalid App Password will still prevent email-code login.

## Delivery failures

Authentication and explicit SMTP rejections are reported as definite failures. Lost or incomplete responses after message submission are uncertain: check Gmail Sent or the supplier-request result before trying another request. Existing supplier request IDs and receipts continue to prevent duplicate sends when the result is uncertain.

The SMTP connection uses implicit TLS on port 465 with certificate verification, bounded connection/read timeouts and a fixed Gmail host. Credentials and message data are not written into SMTP debug logs. Unexpected provider responses are replaced by controlled errors.

The frontend waits for the API's `smtp_supported` flag before allowing SMTP selection during a rolling deployment. `/health` exposes a valid Render commit identifier when available, allowing the deployed API revision to be checked without exposing connection credentials.
