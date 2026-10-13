# Bringing your Wix history into the admin page

1. Run `07_wix_import_schema.sql` in the Supabase SQL Editor (empty tables, no client data).
2. Run the private file `wix_import_data.sql` the same way. It is **not** stored in GitHub because it holds client details. Safe to run twice, nothing is duplicated.
3. Open admin.html. You will see **Insights** and **Clients**.

What comes across: past appointments (as completed, marked "Imported from Wix"), clients, and daily sales for the revenue chart.
What does not: Wix passwords (clients sign up again and their old visits link up by email), website traffic.
Imported contacts have `marketing_ok = false`. Only email them about their appointments unless they opt in.
