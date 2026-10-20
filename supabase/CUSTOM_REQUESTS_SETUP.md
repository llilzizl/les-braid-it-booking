# Custom style requests: setup

This adds the Custom Style Request workflow:

1. A client fills in the form on the booking page: photo, description, how long it takes
   (hour and minute wheels), a suggested price, and one of your free slots from the live calendar.
2. You get an email, and the request appears at the top of `admin.html`.
3. On the request you can:
   - **Accept as asked**, or **suggest changes** (price, deposit, length, date or time) with a comment.
     Either way the slot is **held for 48 hours** and the client is emailed a link to their request page.
   - **Send a message only**, to ask a question.
   - **Decline**, with an optional comment.
4. On their request page (`my-request.html`) the client can **pay the deposit** (this accepts your offer and
   books them in), **reply to you**, or **decline**. You get an email when they reply or decline.
5. Paying goes through the same Stripe deposit system as normal bookings. Once paid, the booking is confirmed,
   they get the usual confirmation email, and the request shows as **Booked and paid**.

**Your admin area** groups requests by status (Needs you, Waiting for client, Waiting for deposit, Deposit paid, Declined),
shows each person with their times and deposit status, opens the full details when you click a row, and has a
**Calendar** view showing every request on its date.

**Members** see all their requests on their dashboard, with your latest message and buttons to open the conversation or pay.

If the deposit is not paid in time, the hold ends and the slot is free again. You can send a new offer from the admin page.

Do these steps in order. You need the Stripe deposits (`STRIPE_SETUP.md`) and emails (`EMAIL_SETUP.md`) already working.

## 1. Run the database changes
Supabase > SQL Editor > New query > paste all of `supabase/09_custom_requests.sql` > Run.

It is safe to run more than once. It creates:
- the `custom_requests` table and `custom_request_messages` (the conversation)
- a **private** storage bucket called `custom-requests` for the photos (8 MB max, images only).
  Only you can see the photos, through the admin page.
- the rules for holding a slot while a deposit is waiting

## 1b. Let members see their requests
Run `supabase/10_member_custom_requests.sql` the same way. It lets a signed-in member **read** (never change)
their own requests, the conversation and their photos on `member-dashboard.html`. A request counts as theirs if they
sent it while logged in, or with the same email as their account.

## 2. Create the function
Supabase > Edge Functions > Deploy a new function > **Via Editor**.

1. Name it exactly `custom-requests`.
2. Paste all of `supabase/functions/custom-requests/index.ts`. Deploy.
   (Don't paste `index.test.ts`. That file is only for testing.)
3. Open the function > Details/Settings and switch **Verify JWT** **off**. Clients aren't logged in.
   The function protects itself: it only accepts requests from your website, and the answer actions
   check that you are signed in as admin.

## 3. Secrets
Nothing new is needed. It uses the same secrets as your other functions:
`STRIPE_SECRET_KEY`, `SITE_URL`, `BREVO_API_KEY`, `EMAIL_FROM`, and optionally `OWNER_EMAIL`, `EMAIL_FROM_NAME`, `ALLOWED_ORIGINS`.

Optional extra:

| Name | What it does |
| --- | --- |
| `CUSTOM_HOLD_HOURS` | How long an offer holds the slot before the deposit must be paid. Default `48`. |

## 4. Publish the website changes
Merge the pull request, wait a minute for GitHub Pages, then hard refresh (Ctrl + Shift + R).

## 5. Test it (Stripe test mode)
1. On the booking page, click **Custom Style Request**. Add a photo, a description, swipe to a length,
   choose a day and a time, fill in your details and send it.
   - You should get the "I've got your request" email, and an email to you about the new request.
2. Open `admin.html`. The request shows at the top with the photo and a **needs you** badge.
3. Change the start time, write a comment and click **Send suggested changes**.
   - The client email shows what changed. The slot disappears from the booking calendar (it's held).
4. Open the link in that email. On the request page, write a reply and send it.
   - You get an email, and the reply shows in the conversation on the admin page.
5. On the request page, click **Pay deposit** and use the test card `4242 4242 4242 4242`.
   - You land on "You're booked in!", get the normal confirmation email, and the request shows **Booked and paid**.

If something doesn't work: Supabase > Edge Functions > custom-requests > Logs shows the exact error.

## Changing the settings
- **Price hint** (£17–£20 an hour): `RATE_LOW` and `RATE_HIGH` at the top of `assets/js/custom-request.js`.
- **Starting deposit on the admin form** (£30) and the price used when the client didn't suggest one (£20/hour):
  `DEFAULT_DEPOSIT` and `RATE_HIGH` in the custom requests section of `admin.html`.
- **Hours wheel** range, minute steps, notice and how far ahead: top of `assets/js/custom-request.js`.
  The notice rule (4 days, up to 1 month ahead) must match `submit_custom_request` in `09_custom_requests.sql`.
