-- Ombre add-on for Extra Small Layered Box Braid (+£15).
-- Run in Supabase > SQL Editor before merging, so the price is added to the booking total.
-- The extra 30 minutes is added by the booking pop-up. Safe to run more than once.
insert into public.service_addons (service, label, price) values
  ('Extra Small Layered Box Braid', 'Ombre', 15)
on conflict (service, label) do update set price = excluded.price;
