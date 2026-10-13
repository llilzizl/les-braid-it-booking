# Taking deposits with Stripe

Do these in order. Use **Test mode** in Stripe until step 8 works. No real money moves in test mode.

**Never paste your Stripe secret key (sk_...), webhook secret (whsec_...) or the Supabase service_role / secret key into chat, into this repo, or into any file on the site.** They only ever go in the Supabase Secrets box (step 4).

## 1. Run the database changes
Supabase > SQL Editor > New query > paste all of `supabase/04_payments.sql` > Run. It is safe to run twice. Your current booking form keeps working until step 9.

## 1b. Add-on prices
Run `supabase/06_addon_prices.sql` the same way. It adds paid add-ons (like Waist/Hip length) to each booking's full price. Edit them in Table Editor > service_addons.

## 2. Create the two functions
Supabase > Edge Functions > Deploy a new function > **Via Editor**.

1. Name it exactly `create-checkout`. Paste all of `supabase/functions/create-checkout/index.ts`. Deploy.
2. Name it exactly `stripe-webhook`. Paste all of `supabase/functions/stripe-webhook/index.ts`. Deploy.
3. For **both**, open the function > Details/Settings and switch **Verify JWT with legacy secret** (Verify JWT) **off**. Guests are not logged in and Stripe has no login, so these two must be open. The functions protect themselves (allowed website check, Stripe signature check).

Copy the address of `stripe-webhook`. It looks like `https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook`.

## 3. Add the webhook in Stripe
Stripe Dashboard (Test mode on) > Developers > Webhooks > Add endpoint.

- Endpoint URL: the stripe-webhook address from step 2.
- Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.

After saving, click **Reveal** next to Signing secret (starts `whsec_`). Keep that tab open for step 4.

## 4. Add the secrets in Supabase
Supabase > Edge Functions > Secrets (Manage secrets). Add:

| Name | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe > Developers > API keys > Secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_...` from step 3 |
| `SITE_URL` | your website address with no slash on the end, for example `https://llilzizl.github.io/les-braid-it-booking` |

`SUPABASE_URL` and the Supabase keys are added for you. If your site is on a custom domain too, also add `ALLOWED_ORIGINS` with each address separated by commas, for example `https://lesbraidit.co.uk,https://www.lesbraidit.co.uk`.

## 5. Publish the website changes
Merge the pull request so GitHub Pages updates (give it a minute or two), then hard refresh the booking page.

## 6. Check the deposit amounts
Deposits and full prices come from the `services` table in Supabase (Table Editor > services), not from the website. Edit `deposit_amount` and `price` there any time.

## 7. Stripe settings worth checking
- Settings > Business > Public details: your business name (shown on the payment page).
- Settings > Branding: logo and pink colour.
- Settings > Payments > Payment methods: Cards, Apple Pay and Google Pay are on by default.
- Settings > Customer emails: turn on "Successful payments" so clients get a Stripe receipt until our own emails are built.

## 8. Test with a fake card
Make a booking on the site for a day at least 4 days away. On the Stripe page use:

- Card `4242 4242 4242 4242`, any future expiry, any 3 digits, any postcode.

Then check:
- You land on "You're booked in!".
- Supabase > Table Editor > bookings: the row has `status = confirmed`, `payment_status = paid`.
- admin.html shows "Deposit £20 paid".
- Stripe > Payments shows the test payment.
- Try the card `4000 0000 0000 0002` (declined) and the Back arrow on the Stripe page: no booking should be confirmed and the time frees up after 30 minutes.

If it does not work: Supabase > Edge Functions > click the function > Logs, and Stripe > Developers > Webhooks > your endpoint > recent deliveries. Both show the exact error.

## 9. Lock it down
Once a test payment works, run `supabase/05_lock_bookings.sql` in the SQL Editor. From then on bookings can only be created through the payment function, so nobody can skip the deposit by calling the database directly.

## 10. Go live
1. Switch Stripe out of Test mode (complete the account activation questions).
2. Create the live webhook endpoint (same URL, same events) and note its new `whsec_...`.
3. Change the Supabase secrets `STRIPE_SECRET_KEY` (to `sk_live_...`) and `STRIPE_WEBHOOK_SECRET` (to the live one).
4. Make one real booking with your own card and refund it from Stripe.
5. In Supabase > Authentication, switch **Confirm email** back on and check the **Site URL** is your real site.

## How it works
1. The client picks a time and clicks "Pay deposit". The site sends the details to `create-checkout`.
2. The database re-checks every rule (hours, notice, clashes, blocked days), saves an unpaid booking that holds the time for 30 minutes, and Stripe opens the payment page.
3. When the deposit is paid, Stripe tells `stripe-webhook`, which confirms the booking.
4. If the client leaves without paying, the booking is cancelled and the time is freed.
5. If someone else somehow paid for the same time first, the later payment is refunded automatically.
