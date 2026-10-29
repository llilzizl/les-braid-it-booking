-- Blow dry add-on (+£10) for every service except the classes and takedowns.
-- Run in Supabase > SQL Editor before merging, so the price is added to the booking total.
-- The extra 30 minutes is added by the booking pop-up. Safe to run more than once.
insert into public.service_addons (service, label, price) values
  ('Extra Small Layered Box Braid', 'Blow dry', 10),
  ('Small Layered Knotless Braids', 'Blow dry', 10),
  ('Smedium Layered Knotless Braids', 'Blow dry', 10),
  ('The ''Perfect'' U Part Install', 'Blow dry', 10),
  ('The ''Perfect'' Sew In', 'Blow dry', 10),
  ('Flip Over (Minimal leave out - Ivy Method)', 'Blow dry', 10),
  ('Micro Braids with Sew In', 'Blow dry', 10),
  ('Fulani Sew In', 'Blow dry', 10),
  ('Cassie Sew In', 'Blow dry', 10),
  ('Patewo/Shuku and Base', 'Blow dry', 10),
  ('Straight Pick & Drop Boho Braids', 'Blow dry', 10),
  ('''Cassie'' Small Knotless BOHO French Curl', 'Blow dry', 10),
  ('Small Knotless BOHO French Curl', 'Blow dry', 10),
  ('Smedium Knotless BOHO French Curl', 'Blow dry', 10),
  ('Fulani Style', 'Blow dry', 10),
  ('Flat Twist', 'Blow dry', 10),
  ('Small Mini Twist / Mini Braids', 'Blow dry', 10),
  ('Shuku/Patewo (and Base)', 'Blow dry', 10),
  ('Fulani Crochet', 'Blow dry', 10)
on conflict (service, label) do update set price = excluded.price;
