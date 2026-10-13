# Confirmation emails with Brevo

After a deposit is paid, the client gets a confirmation email and you get a heads-up email. Both come from info@lesbraidit.co.uk.

## 1. Run the database change
Supabase > SQL Editor > New query > paste `supabase/08_emails.sql` > Run.

## 2. Verify your domain in Brevo
Without this, emails go to spam or are refused.
1. Brevo > your name (top right) > **Senders, Domains & Dedicated IPs** > **Domains** > **Add a domain** > `lesbraidit.co.uk`.
2. Brevo shows a few DNS records (a Brevo code, DKIM, and DMARC). Add each one at the place that controls your domain's DNS (where you bought the domain, or Wix if it is managed there). Copy the Type, Name and Value exactly.
3. Back in Brevo click **Authenticate**. It can take from a few minutes up to a day.
4. **Senders** > add `info@lesbraidit.co.uk` as a sender and click the link Brevo emails to that inbox.

## 3. Create an API key
Brevo > your name > **SMTP & API** > **API keys** > **Generate a new API key**. Copy it (starts `xkeysib-`). Keep it private. It goes only in Supabase Secrets, never in chat or on the site.

## 4. Add the secrets in Supabase
Edge Functions > Secrets:

| Name | Value |
| --- | --- |
| `BREVO_API_KEY` | the key from step 3 |
| `EMAIL_FROM` | `info@lesbraidit.co.uk` |

`SITE_URL` is already set. Optional extras: `EMAIL_FROM_NAME` (default "Les Braid It"), `OWNER_EMAIL` (where your heads-up goes, default is EMAIL_FROM), `LOCATION_TEXT` (a line about where the appointment is, shown in the client's email).

## 5. Update the stripe-webhook function
Edge Functions > stripe-webhook > open the code editor, replace everything with the new `supabase/functions/stripe-webhook/index.ts` from GitHub, and Deploy. Keep Verify JWT off.

## 6. Test
Make a test booking (Stripe test card 4242 4242 4242 4242, use an email you can read). Within a minute you should get the confirmation, and the owner email should reach OWNER_EMAIL.
If nothing arrives: Supabase > Edge Functions > stripe-webhook > Logs, and Brevo > Transactional > Logs.

A failed email never undoes a booking. If sending fails, the booking stays confirmed and the email can be sent again later.
