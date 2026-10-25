-- Rename "Micro Braids w/Sew In" to "Micro Braids with Sew In".
-- Run this in Supabase > SQL Editor just before merging the website change,
-- so bookings for this style keep working. Safe to run more than once.

-- 1. The service itself (price, deposit, length and gap are kept)
update public.services
set name = 'Micro Braids with Sew In'
where name = 'Micro Braids w/Sew In'
  and not exists (select 1 from public.services where name = 'Micro Braids with Sew In');

delete from public.services
where name = 'Micro Braids w/Sew In'
  and exists (select 1 from public.services where name = 'Micro Braids with Sew In');

-- 2. Any add-ons saved for it
update public.service_addons set service = 'Micro Braids with Sew In' where service = 'Micro Braids w/Sew In';

-- 3. Past and upcoming bookings, so they show the new name in admin and emails
update public.bookings set service_type = 'Micro Braids with Sew In' where service_type = 'Micro Braids w/Sew In';
