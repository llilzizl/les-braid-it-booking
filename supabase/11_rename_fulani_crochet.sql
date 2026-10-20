-- Rename "Fulani Crotchet" to "Fulani Crochet" (the correct spelling).
-- Run this in Supabase > SQL Editor just before merging the website change,
-- so bookings for this style keep working. Safe to run more than once.

-- 1. The service itself (price, deposit, length and gap are kept)
update public.services
set name = 'Fulani Crochet'
where name = 'Fulani Crotchet'
  and not exists (select 1 from public.services where name = 'Fulani Crochet');

-- If both names somehow exist, keep the new one only
delete from public.services
where name = 'Fulani Crotchet'
  and exists (select 1 from public.services where name = 'Fulani Crochet');

-- 2. Any add-ons saved for it
update public.service_addons set service = 'Fulani Crochet' where service = 'Fulani Crotchet';

-- 3. Past and upcoming bookings, so they show the new name in admin and emails
update public.bookings set service_type = 'Fulani Crochet' where service_type = 'Fulani Crotchet';
