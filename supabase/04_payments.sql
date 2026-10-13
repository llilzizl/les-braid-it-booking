-- ==========================================================
-- Les Braid It: 04 deposits and payments
-- Run in Supabase after 03_availability.sql:
-- Dashboard > SQL Editor > New query > paste > Run
--
-- Safe to run more than once, and safe to run before the Stripe
-- functions are live: it only ADDS things. Your current booking
-- form keeps working until you run 05_lock_bookings.sql.
--
-- Works with both versions of the bookings table (numeric or uuid ids),
-- so ids are handled as text inside these functions.
-- ==========================================================

-- 1. Payment details on each booking
alter table public.bookings add column if not exists deposit_amount numeric;
alter table public.bookings add column if not exists payment_status text default 'pending';
alter table public.bookings add column if not exists stripe_session_id text;
alter table public.bookings add column if not exists stripe_payment_intent text;
alter table public.bookings add column if not exists paid_at timestamptz;
alter table public.bookings add column if not exists price numeric;
alter table public.bookings add column if not exists source text not null default 'website';

create unique index if not exists bookings_stripe_session_idx
  on public.bookings (stripe_session_id) where stripe_session_id is not null;

-- 2. Full price of each style (the deposit is taken off this on the day)
alter table public.services add column if not exists price numeric;

update public.services s set price = p.price
from (values
  ('Extra Small Layered Box Braid', 200),
  ('Small Layered Knotless Braids', 150),
  ('Smedium Layered Knotless Braids', 130),
  ('The ''Perfect'' U Part Install', 90),
  ('The ''Perfect'' Sew In', 130),
  ('Flip Over (Minimal leave out - Ivy Method)', 120),
  ('Micro Braids w/Sew In', 130),
  ('Fulani Sew In', 85),
  ('Cassie Sew In', 85),
  ('Patewo/Shuku and Base', 100),
  ('Small Lemonade Braids', 100),
  ('Straight Pick & Drop Boho Braids', 140),
  ('''Cassie'' Small Knotless BOHO French Curl', 110),
  ('Small Knotless BOHO French Curl', 130),
  ('Smedium Knotless BOHO French Curl', 120),
  ('Fulani Style', 30),
  ('Flat Twist', 30),
  ('Small Mini Twist / Mini Braids', 40),
  ('Shuku/Patewo (and Base)', 30),
  ('Extra Small Layered Braids Takedown', 55),
  ('The ''Perfect'' Sew In Takedown', 30),
  ('Fulani Crotchet', 60),
  ('The ''Perfect'' Sew In Classes', 650)
) as p(name, price)
where s.name = p.name;

-- 3. Is a time slot taken? One shared rule for the calendar and the server.
-- A booking blocks its length plus the gap after it. Unpaid bookings only
-- hold the slot for 30 minutes.
create or replace function public.slot_conflicts(
  p_date date, p_start time, p_minutes int, p_exclude text default null, p_paid_only boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    left join public.services s on s.name = b.service_type
    where b.booking_date = p_date
      and (p_exclude is null or b.id::text <> p_exclude)
      and (
        b.status in ('confirmed', 'completed')
        or (not p_paid_only and b.status = 'pending' and b.created_at > now() - interval '30 minutes')
      )
      and (extract(hour from p_start) * 60 + extract(minute from p_start)) < 
          (extract(hour from b.booking_time) * 60 + extract(minute from b.booking_time)
            + coalesce(b.duration_minutes, s.duration_minutes, 240)
            + coalesce(nullif(b.buffer_minutes, 0), s.buffer_minutes, 0))
      and (extract(hour from p_start) * 60 + extract(minute from p_start) + p_minutes) >
          (extract(hour from b.booking_time) * 60 + extract(minute from b.booking_time))
  );
$$;

-- 4. Create an unpaid (pending) booking. Only the server can call this.
-- It re-checks every rule, so nothing can be bypassed from the browser.
-- Keep the notice and window below in step with MIN_NOTICE_DAYS and
-- MAX_MONTHS_AHEAD in assets/js/main.js.
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
     p_date, p_time, 'pending', 'pending', svc.deposit_amount, svc.price, p_duration, svc.buffer_minutes, 'website')
  returning id::text into v_id;

  return query select v_id, svc.deposit_amount, svc.name;
end;
$$;

-- 5. Stripe says the deposit is paid: confirm the booking.
-- Returns confirmed, conflict (someone else got the slot first, so refund),
-- cancelled or not_found. Safe to call twice.
create or replace function public.confirm_booking_paid(
  p_booking text, p_session text, p_intent text, p_amount numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  svc public.services%rowtype;
begin
  select * into b from public.bookings where id::text = p_booking for update;
  if not found then return 'not_found'; end if;
  if b.status in ('confirmed', 'completed') then return 'confirmed'; end if;
  if b.status = 'cancelled' then return 'cancelled'; end if;

  perform pg_advisory_xact_lock(hashtext('bookings:' || b.booking_date::text));

  select * into svc from public.services where name = b.service_type;
  if public.slot_conflicts(
       b.booking_date, b.booking_time,
       coalesce(b.duration_minutes, svc.duration_minutes, 240) + coalesce(nullif(b.buffer_minutes, 0), svc.buffer_minutes, 0),
       p_booking, true) then
    return 'conflict';
  end if;

  update public.bookings
  set status = 'confirmed',
      payment_status = 'paid',
      paid_at = now(),
      stripe_session_id = coalesce(stripe_session_id, p_session),
      stripe_payment_intent = p_intent,
      deposit_amount = coalesce(p_amount, deposit_amount)
  where id::text = p_booking;
  return 'confirmed';
end;
$$;

-- 6. Checkout was abandoned or expired: free the slot
create or replace function public.mark_booking_expired(p_booking text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings
  set status = 'cancelled', payment_status = 'expired'
  where id::text = p_booking and status = 'pending' and coalesce(payment_status, 'pending') <> 'paid';
$$;

-- 7. Paid but the slot was already taken: record the refund
create or replace function public.mark_booking_refunded(p_booking text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings
  set status = 'cancelled', payment_status = 'refunded'
  where id::text = p_booking and status <> 'completed';
$$;

-- 8. The "thank you" page checks its own payment. It needs the long random
-- Stripe session id, and only gets back the appointment, no personal details.
create or replace function public.booking_status_by_session(p_session text)
returns table (status text, payment_status text, service_type text, booking_date date, booking_time time, deposit_amount numeric)
language sql
stable
security definer
set search_path = public
as $$
  select b.status, b.payment_status, b.service_type, b.booking_date, b.booking_time, b.deposit_amount
  from public.bookings b
  where length(coalesce(p_session, '')) > 20 and b.stripe_session_id = p_session
  limit 1;
$$;

-- 9. Who can call what. Functions are open to everyone by default in
-- Postgres, so close them first, then open only what is needed.
revoke all on function public.slot_conflicts(date, time, int, text, boolean) from public, anon, authenticated;
revoke all on function public.create_pending_booking(uuid, text, text, text, text, text, date, time, int) from public, anon, authenticated;
revoke all on function public.confirm_booking_paid(text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.mark_booking_expired(text) from public, anon, authenticated;
revoke all on function public.mark_booking_refunded(text) from public, anon, authenticated;
revoke all on function public.booking_status_by_session(text) from public;

grant execute on function public.create_pending_booking(uuid, text, text, text, text, text, date, time, int) to service_role;
grant execute on function public.confirm_booking_paid(text, text, text, numeric) to service_role;
grant execute on function public.mark_booking_expired(text) to service_role;
grant execute on function public.mark_booking_refunded(text) to service_role;
grant execute on function public.booking_status_by_session(text) to anon, authenticated, service_role;

-- 10. The calendar uses the same slot rule as the server
create or replace function public.get_busy_slots(from_date date, to_date date)
returns table (booking_date date, start_time time, block_minutes int)
language sql
security definer
stable
set search_path = public
as $$
  select b.booking_date,
         b.booking_time,
         coalesce(b.duration_minutes, s.duration_minutes, 240)
           + coalesce(nullif(b.buffer_minutes, 0), s.buffer_minutes, 0)
  from public.bookings b
  left join public.services s on s.name = b.service_type
  where b.booking_date between from_date and to_date
    and (
      b.status in ('confirmed', 'completed')
      or (b.status = 'pending' and b.created_at > now() - interval '30 minutes')
    );
$$;

grant execute on function public.get_busy_slots(date, date) to anon, authenticated;

notify pgrst, 'reload schema';
