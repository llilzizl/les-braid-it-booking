-- Pause online booking for the two takedowns while their details are finalised.
-- Run in Supabase > SQL Editor. Past bookings are kept.
-- To open booking again, set active back to true.
update public.services set active = false
where name in ('Extra Small Layered Braids Takedown', 'The ''Perfect'' Sew In Takedown');
