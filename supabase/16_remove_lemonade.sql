-- Stop offering Small Lemonade Braids.
-- Run in Supabase > SQL Editor. The style can no longer be booked, but past
-- bookings keep their name and details. To offer it again, set active back to true.
update public.services set active = false where name = 'Small Lemonade Braids';
