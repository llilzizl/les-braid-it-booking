-- ==========================================================
-- Les Braid It: 06 add-on prices
-- Run in Supabase after 04_payments.sql:
-- Dashboard > SQL Editor > New query > paste > Run
--
-- Paid add-ons (like Waist/Hip length +£40) are now added to the full
-- price saved with each booking, so "to pay on the day" is right.
-- Safe to run more than once. Edit prices in Table Editor > service_addons.
-- ==========================================================

create table if not exists public.service_addons (
  service text not null,
  label   text not null,
  price   numeric not null,
  primary key (service, label)
);

alter table public.service_addons enable row level security;
drop policy if exists "anyone reads addons" on public.service_addons;
create policy "anyone reads addons" on public.service_addons for select using (true);
drop policy if exists "admins manage addons" on public.service_addons;
create policy "admins manage addons" on public.service_addons for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.service_addons (service, label, price) values
  ('Extra Small Layered Box Braid', 'Waist/Hip length', 40),
  ('Small Layered Knotless Braids', 'Waist/Hip length', 35),
  ('Smedium Layered Knotless Braids', 'Waist/Hip length', 30),
  ('The ''Perfect'' Sew In', '2 Part Sew In', 50),
  ('The ''Perfect'' Sew In', 'Flip Over', 30),
  ('Patewo/Shuku and Base', 'French Curl (hair included)', 10),
  ('Small Lemonade Braids', '5–6 rows of braids in the back', 10),
  ('Fulani Style', 'Marley hair (included)', 5),
  ('Flat Twist', 'Marley hair (included)', 5),
  ('Small Mini Twist / Mini Braids', 'Marley hair (included)', 5),
  ('Shuku/Patewo (and Base)', 'Marley hair (included)', 5)
on conflict (service, label) do update set price = excluded.price;

create or replace function public.create_pending_booking(
  p_member uuid, p_name text, p_email text, p_phone text, p_service text, p_addons text,
  p_date date, p_time time, p_duration int
)
returns table (booking_id text, deposit numeric, service_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  svc public.services%rowtype;
  wh public.working_hours%rowtype;
  today date := (now() at time zone 'Europe/London')::date;
  start_min int;
  v_id text;
  v_extras numeric := 0;
begin
  if coalesce(trim(p_name), '') = '' or length(p_name) > 120 then raise exception 'invalid_details'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'invalid_details'; end if;
  if coalesce(trim(p_phone), '') = '' or length(p_phone) > 40 then raise exception 'invalid_details'; end if;

  select * into svc from public.services where name = p_service and active;
  if not found or svc.duration_minutes is null then raise exception 'invalid_service'; end if;

  if p_duration is null or p_duration < svc.duration_minutes or p_duration > svc.duration_minutes + 360 then
    raise exception 'invalid_duration';
  end if;

  if p_date is null or p_time is null then raise exception 'invalid_time'; end if;
  start_min := extract(hour from p_time)::int * 60 + extract(minute from p_time)::int;
  if start_min % 30 <> 0 then raise exception 'invalid_time'; end if;

  if p_date < today + 4 or p_date > (today + interval '1 month')::date then raise exception 'date_unavailable'; end if;
  if exists (select 1 from public.blocked_dates where blocked_date = p_date) then raise exception 'date_unavailable'; end if;

  select * into wh from public.working_hours where day_of_week = extract(dow from p_date)::int;
  if not found or not wh.is_open or wh.open_time is null or wh.close_time is null then raise exception 'date_unavailable'; end if;
  if p_time < wh.open_time
     or start_min + p_duration > extract(hour from wh.close_time)::int * 60 + extract(minute from wh.close_time)::int then
    raise exception 'invalid_time';
  end if;

  -- Paid add-ons (longer length, extra styles) are added to the full price
  select coalesce(sum(a.price), 0) into v_extras
  from public.service_addons a
  where a.service = p_service
    and a.label = any (string_to_array(coalesce(p_addons, ''), ', '));

  -- Stop one person holding lots of slots with unpaid bookings
  if (select count(*) from public.bookings
      where lower(email) = lower(p_email) and status = 'pending' and created_at > now() - interval '30 minutes') >= 3 then
    raise exception 'too_many_pending';
  end if;

  -- One at a time per day, so two people cannot take the same slot together
  perform pg_advisory_xact_lock(hashtext('bookings:' || p_date::text));

  if public.slot_conflicts(p_date, p_time, p_duration + svc.buffer_minutes) then raise exception 'slot_taken'; end if;

  insert into public.bookings
    (member_id, name, email, phone, service_type, addons, booking_date, booking_time,
     status, payment_status, deposit_amount, price, duration_minutes, buffer_minutes, source)
  values
    (p_member, trim(p_name), trim(p_email), trim(p_phone), p_service, nullif(trim(coalesce(p_addons, '')), ''),
     p_date, p_time, 'pending', 'pending', svc.deposit_amount, svc.price + v_extras, p_duration, svc.buffer_minutes, 'website')
  returning id::text into v_id;

  return query select v_id, svc.deposit_amount, svc.name;
end;
$$;

-- Keep the same access rules as before
revoke all on function public.create_pending_booking(uuid, text, text, text, text, text, date, time, int) from public, anon, authenticated;
grant execute on function public.create_pending_booking(uuid, text, text, text, text, text, date, time, int) to service_role;

-- Fix bookings already made with add-ons (price was only the base style)
update public.bookings b
set price = s.price + coalesce((
      select sum(a.price) from public.service_addons a
      where a.service = b.service_type
        and a.label = any (string_to_array(coalesce(b.addons, ''), ', '))), 0)
from public.services s
where s.name = b.service_type and b.addons is not null and b.price is not null
  and b.source = 'website';

notify pgrst, 'reload schema';
