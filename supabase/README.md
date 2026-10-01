# Member area: Supabase setup

The member pages (`login.html`, `reset-password.html`, `member-dashboard.html`) use
[Supabase](https://supabase.com) for accounts and data. Until it's connected, the
login page shows a "being set up" message and the forms are disabled.

## 1. Create the project
1. Sign up at supabase.com and create a new project (choose the London region).
2. Save the database password somewhere safe.

## 2. Create the tables
Go to **SQL Editor → New query**, then paste and run each file in this folder in order:
- `01_profiles.sql`: member profiles
- `02_bookings.sql`: appointments made from the booking calendar (guests and members)

## 3. Connect the website
Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key
into `assets/js/supabase-config.js`.

## 4. Set the allowed URLs
Go to **Authentication → URL Configuration**:
- **Site URL**: `https://llilzizl.github.io/les-braid-it-portfolio/`
- **Redirect URLs**: add
  - `https://llilzizl.github.io/les-braid-it-portfolio/**`
  - `http://127.0.0.1:5500/**` (for testing locally with Live Server)

Without these, the confirmation and password reset links in emails won't work.

## 5. Emails
Supabase's built-in email sender only allows a few emails an hour, so it's for testing only.
Before real clients sign up, go to **Authentication → Emails → SMTP Settings** and connect a
free sender such as [Resend](https://resend.com) or Brevo. The same sender will be used for
booking and cancellation emails later.

You can edit the wording of the confirmation and reset emails under **Authentication → Emails → Templates**.

## 6. Make yourself admin
Sign up on the site with your own email, then run this in the SQL Editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'lesbraidit@outlook.com');
```
