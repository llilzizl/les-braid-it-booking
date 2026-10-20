-- ==========================================================
-- Les Braid It: 09 custom style requests
-- Run in Supabase after 08_emails.sql:
-- Dashboard > SQL Editor > New query > paste > Run
-- Safe to run more than once.
--
-- The workflow:
--   1. A client sends a request: photo, description, how long it
--      takes, a suggested price and one of your free slots.
--      (Through the custom-requests function. It does NOT hold the slot.)
--   2. On admin.html you can:
--        - accept it as asked, or suggest a different price, deposit,
--          length, date or time (an "offer"). Either way the slot is
--          HELD (48 hours by default) and the client gets a private link
--          to pay the deposit.
--        - send a message only (a question), or decline.
--   3. On their private page the client can pay the deposit (which
--      accepts the offer), reply to you, or decline.
--   4. When the deposit is paid, the existing stripe-webhook confirms
--      the booking and the request is marked as booked.
--   Every message both ways is kept in custom_request_messages.
--   If the deposit is not paid in time, the hold ends and the slot frees up.
-- ==========================================================

-- 1. The requests
create table if not exists public.custom_requests (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid references auth.users (id) on delete set null,
  name             text not null,
  email            text not null,
  phone            text not null,
  description      text not null,
  photo_path       text,
  duration_minutes int  not null,
  suggested_price  numeric,
  requested_date   date not null,
  requested_time   time not null,
  -- new             waiting for you
  -- client_replied  the client answered you: waiting for you
  -- owner_replied   you asked something: waiting for the client
  -- accepted        your offer is out and the slot is held: waiting for the deposit
  -- declined / client_declined / booked / expired
  status           text not null default 'new',
  -- filled in when you accept
  final_price      numeric,
  deposit_amount   numeric,
  final_duration   int,
  final_date       date,
  final_time       time,
  response_message text,
  pay_token        text unique,      -- the private link the client uses
  hold_until       timestamptz,
  booking_id       text,
  responded_at     timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.custom_requests drop constraint if exists custom_requests_status_check;
alter table public.custom_requests add constraint custom_requests_status_check
  check (status in ('new', 'client_replied', 'owner_replied', 'accepted', 'declined', 'client_declined', 'booked', 'expired'));

create index if not exists custom_requests_status_idx on public.custom_requests (status, created_at desc);

-- The conversation: every offer and message, both ways
create table if not exists public.custom_request_messages (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.custom_requests (id) on delete cascade,
  sender      text not null check (sender in ('owner', 'client')),
  kind        text not null default 'message' check (kind in ('message', 'offer', 'decline')),
  body        text,
  offer       jsonb,            -- price, deposit, duration, date, time when kind = 'offer'
  created_at  timestamptz not null default now()
);

create index if not exists custom_request_messages_request_idx on public.custom_request_messages (request_id, created_at);

alter table public.custom_request_messages enable row level security;
drop policy if exists "Admin reads request messages" on public.custom_request_messages;
create policy "Admin reads request messages" on public.custom_request_messages
  for select to authenticated using (public.is_admin());

alter table public.custom_requests enable row level security;

-- Only you (admin) can read and update requests from the browser.
-- Clients never read this table directly: new requests come in through the
-- custom-requests function, and the deposit page uses custom_request_by_token.
drop policy if exists "Admin reads custom requests" on public.custom_requests;
create policy "Admin reads custom requests" on public.custom_requests
  for select to authenticated using (public.is_admin());

drop policy if exists "Admin updates custom requests" on public.custom_requests;
create policy "Admin updates custom requests" on public.custom_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2. Private storage for the photos (max 8 MB, images only).
-- Photos are uploaded by the function; only you can view them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('custom-requests', 'custom-requests', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin views custom request photos" on storage.objects;
create policy "Admin views custom request photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'custom-requests' and public.is_admin());

-- 3. Bookings can be held for longer than 30 minutes, and remember their request
alter table public.bookings add column if not exists hold_until timestamptz;
alter table public.bookings add column if not exists custom_request_id uuid;

-- 4. Busy times now include accepted requests waiting for their deposit.
-- (Same as in 04_payments.sql, plus the hold_until line.)
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
      or (b.status = 'pending' and (b.created_at > now() - interval '30 minutes' or b.hold_until > now()))
    );
$$;

grant execute on function public.get_busy_slots(date, date) to anon, authenticated;

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
        or (not p_paid_only and b.status = 'pending'
            and (b.created_at > now() - interval '30 minutes' or b.hold_until > now()))
      )
      and (extract(hour from p_start) * 60 + extract(minute from p_start)) <
          (extract(hour from b.booking_time) * 60 + extract(minute from b.booking_time)
            + coalesce(b.duration_minutes, s.duration_minutes, 240)
            + coalesce(nullif(b.buffer_minutes, 0), s.buffer_minutes, 0))
      and (extract(hour from p_start) * 60 + extract(minute from p_start) + p_minutes) >
          (extract(hour from b.booking_time) * 60 + extract(minute from b.booking_time))
  );
$$;

revoke all on function public.slot_conflicts(date, time, int, text, boolean) from public, anon, authenticated;

-- An unfinished Stripe page must not cancel a booking that is still being held:
-- the client can open their deposit link again until the hold ends.
create or replace function public.mark_booking_expired(p_booking text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings
  set status = 'cancelled', payment_status = 'expired'
  where id::text = p_booking and status = 'pending' and coalesce(payment_status, 'pending') <> 'paid'
    and (hold_until is null or hold_until <= now());
$$;

revoke all on function public.mark_booking_expired(text) from public, anon, authenticated;
grant execute on function public.mark_booking_expired(text) to service_role;

-- 5. Save a new request. Only the custom-requests function can call this.
-- Uses the same rules as normal bookings: 4 days' notice, up to 1 month ahead,
-- inside working hours, not on a blocked day, not clashing with a booking.
create or replace function public.submit_custom_request(
  p_member uuid, p_name text, p_email text, p_phone text, p_description text, p_photo_path text,
  p_duration int, p_price numeric, p_date date, p_time time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wh public.working_hours%rowtype;
  today date := (now() at time zone 'Europe/London')::date;
  start_min int;
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' or length(p_name) > 120 then raise exception 'invalid_details'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'invalid_details'; end if;
  if coalesce(trim(p_phone), '') = '' or length(p_phone) > 40 then raise exception 'invalid_details'; end if;
  if coalesce(trim(p_description), '') = '' or length(p_description) > 2000 then raise exception 'invalid_description'; end if;

  if p_duration is null or p_duration < 30 or p_duration > 720 or p_duration % 15 <> 0 then raise exception 'invalid_duration'; end if;
  if p_price is not null and (p_price < 0 or p_price > 5000) then raise exception 'invalid_price'; end if;

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

  -- 15 minutes tidy-up gap after, the same default the calendar uses
  if public.slot_conflicts(p_date, p_time, p_duration + 15) then raise exception 'slot_taken'; end if;

  -- Stop the form being used to flood you with requests
  if (select count(*) from public.custom_requests
      where lower(email) = lower(p_email) and created_at > now() - interval '1 day') >= 3 then
    raise exception 'too_many_requests';
  end if;

  insert into public.custom_requests
    (member_id, name, email, phone, description, photo_path, duration_minutes, suggested_price, requested_date, requested_time)
  values
    (p_member, trim(p_name), trim(p_email), trim(p_phone), trim(p_description), p_photo_path,
     p_duration, p_price, p_date, p_time)
  returning id into v_id;
  return v_id;
end;
$$;

-- Helper: the private link token for a request (made the first time you reply)
create or replace function public.custom_request_link(p_request uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v text;
begin
  select pay_token into v from public.custom_requests where id = p_request;
  if v is null then
    v := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    update public.custom_requests set pay_token = v where id = p_request;
  end if;
  return v;
end;
$$;

-- Helper: cancel the held booking of a request, if it has one waiting for a deposit
create or replace function public.release_custom_hold(p_request uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings b set status = 'cancelled', payment_status = 'expired'
  from public.custom_requests c
  where c.id = p_request and b.id::text = c.booking_id and b.status = 'pending';
$$;

-- 6. You send an offer: accept as asked, or suggest a new price, deposit,
-- length, date or time. Holds the slot with a booking waiting for the deposit.
-- Sending a new offer replaces the old one.
-- Only the custom-requests function calls this, after checking you are admin.
create or replace function public.send_custom_offer(
  p_request uuid, p_price numeric, p_deposit numeric, p_duration int,
  p_date date, p_time time, p_message text, p_hold_hours int default 48
)
returns table (pay_token text, name text, email text, changed boolean, final_price numeric,
               deposit_amount numeric, final_date date, final_time time, final_duration int, hold_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.custom_requests%rowtype;
  v_date date;
  v_time time;
  v_duration int;
  v_token text;
  v_booking text;
  v_hold timestamptz;
  v_changed boolean;
begin
  select * into r from public.custom_requests c where c.id = p_request for update;
  if not found then raise exception 'not_found'; end if;
  if r.status in ('declined', 'client_declined', 'booked') then raise exception 'already_answered'; end if;

  if p_price is null or p_price <= 0 or p_price > 5000 then raise exception 'invalid_price'; end if;
  if p_deposit is null or p_deposit <= 0 or p_deposit > p_price then raise exception 'invalid_deposit'; end if;

  v_duration := coalesce(p_duration, r.duration_minutes);
  v_date := coalesce(p_date, r.requested_date);
  v_time := coalesce(p_time, r.requested_time);
  if v_duration < 30 or v_duration > 720 or v_duration % 15 <> 0 then raise exception 'invalid_duration'; end if;
  if v_date < (now() at time zone 'Europe/London')::date then raise exception 'date_unavailable'; end if;
  if extract(hour from v_time)::int * 60 + extract(minute from v_time)::int + v_duration > 24 * 60 then
    raise exception 'invalid_time';
  end if;
  if p_hold_hours is null or p_hold_hours < 1 or p_hold_hours > 168 then raise exception 'invalid_hold'; end if;

  -- A new offer replaces the old one, so free its slot first
  perform public.release_custom_hold(r.id);

  perform pg_advisory_xact_lock(hashtext('bookings:' || v_date::text));
  if public.slot_conflicts(v_date, v_time, v_duration + 15) then raise exception 'slot_taken'; end if;

  v_hold := now() + make_interval(hours => p_hold_hours);
  v_token := public.custom_request_link(r.id);
  v_changed := v_duration <> r.duration_minutes or v_date <> r.requested_date or v_time <> r.requested_time
               or (r.suggested_price is not null and p_price <> r.suggested_price);

  insert into public.bookings
    (member_id, name, email, phone, service_type, addons, booking_date, booking_time,
     status, payment_status, deposit_amount, price, duration_minutes, buffer_minutes,
     source, hold_until, custom_request_id)
  values
    (r.member_id, r.name, r.email, r.phone, 'Custom style request', null, v_date, v_time,
     'pending', 'pending', p_deposit, p_price, v_duration, 15,
     'custom_request', v_hold, r.id)
  returning id::text into v_booking;

  update public.custom_requests c
  set status = 'accepted',
      final_price = p_price,
      deposit_amount = p_deposit,
      final_duration = v_duration,
      final_date = v_date,
      final_time = v_time,
      response_message = nullif(trim(coalesce(p_message, '')), ''),
      hold_until = v_hold,
      booking_id = v_booking,
      responded_at = now()
  where c.id = r.id;

  insert into public.custom_request_messages (request_id, sender, kind, body, offer)
  values (r.id, 'owner', 'offer', nullif(trim(coalesce(p_message, '')), ''),
          jsonb_build_object('price', p_price, 'deposit', p_deposit, 'duration', v_duration,
                             'date', v_date, 'time', to_char(v_time, 'HH24:MI'), 'changed', v_changed));

  return query select v_token, r.name, r.email, v_changed, p_price, p_deposit, v_date, v_time, v_duration, v_hold;
end;
$$;

-- 7. You send a message only (a question). Any offer that is out stays open.
create or replace function public.owner_message_custom_request(p_request uuid, p_message text)
returns table (pay_token text, name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.custom_requests%rowtype;
begin
  if coalesce(trim(p_message), '') = '' or length(p_message) > 2000 then raise exception 'invalid_message'; end if;
  select * into r from public.custom_requests c where c.id = p_request for update;
  if not found then raise exception 'not_found'; end if;
  if r.status in ('declined', 'client_declined', 'booked') then raise exception 'already_answered'; end if;

  update public.custom_requests c
  set status = case when r.status = 'accepted' and r.hold_until > now() then 'accepted' else 'owner_replied' end,
      responded_at = now()
  where c.id = r.id;

  insert into public.custom_request_messages (request_id, sender, kind, body) values (r.id, 'owner', 'message', trim(p_message));
  return query select public.custom_request_link(r.id), r.name, r.email;
end;
$$;

-- 8. You decline a request
create or replace function public.decline_custom_request(p_request uuid, p_message text)
returns table (name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.custom_requests%rowtype;
begin
  select * into r from public.custom_requests c where c.id = p_request for update;
  if not found then raise exception 'not_found'; end if;
  if r.status = 'booked' then raise exception 'already_answered'; end if;

  perform public.release_custom_hold(r.id);

  update public.custom_requests c
  set status = 'declined',
      response_message = nullif(trim(coalesce(p_message, '')), ''),
      hold_until = null,
      responded_at = now()
  where c.id = r.id;

  insert into public.custom_request_messages (request_id, sender, kind, body)
  values (r.id, 'owner', 'decline', nullif(trim(coalesce(p_message, '')), ''));
  return query select r.name, r.email;
end;
$$;

-- 9. The client replies from their private page. Any offer stays open
-- (and its slot stays held) until it runs out, so they can still pay.
create or replace function public.client_reply_custom_request(p_token text, p_message text)
returns table (request_id uuid, name text, email text, body text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.custom_requests%rowtype;
begin
  if coalesce(trim(p_message), '') = '' or length(p_message) > 2000 then raise exception 'invalid_message'; end if;
  if length(coalesce(p_token, '')) < 40 then raise exception 'not_found'; end if;
  select * into r from public.custom_requests c where c.pay_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if r.status in ('declined', 'client_declined', 'booked') then raise exception 'already_answered'; end if;
  if (select count(*) from public.custom_request_messages m
      where m.request_id = r.id and m.sender = 'client' and m.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_messages';
  end if;

  update public.custom_requests c set status = 'client_replied' where c.id = r.id;
  insert into public.custom_request_messages (request_id, sender, kind, body) values (r.id, 'client', 'message', trim(p_message));
  return query select r.id, r.name, r.email, trim(p_message);
end;
$$;

-- 10. The client turns the offer down
create or replace function public.client_decline_custom_request(p_token text, p_message text)
returns table (request_id uuid, name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.custom_requests%rowtype;
begin
  if length(coalesce(p_token, '')) < 40 then raise exception 'not_found'; end if;
  select * into r from public.custom_requests c where c.pay_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if r.status in ('declined', 'client_declined', 'booked') then raise exception 'already_answered'; end if;

  perform public.release_custom_hold(r.id);
  update public.custom_requests c set status = 'client_declined', hold_until = null where c.id = r.id;
  insert into public.custom_request_messages (request_id, sender, kind, body)
  values (r.id, 'client', 'decline', nullif(trim(coalesce(p_message, '')), ''));
  return query select r.id, r.name, r.email;
end;
$$;

-- 11. The client's private page: the request, the current offer and the
-- conversation. Needs the long private token, returns no contact details.
create or replace function public.custom_request_by_token(p_token text)
returns table (status text, first_name text, description text,
               requested_date date, requested_time time, duration_minutes int, suggested_price numeric,
               final_price numeric, deposit_amount numeric, final_date date, final_time time, final_duration int,
               hold_until timestamptz, offer_open boolean, messages jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.status = 'accepted' and c.hold_until <= now() then 'expired'
           else c.status
         end,
         split_part(trim(c.name), ' ', 1),
         c.description, c.requested_date, c.requested_time, c.duration_minutes, c.suggested_price,
         c.final_price, c.deposit_amount, c.final_date, c.final_time, c.final_duration,
         c.hold_until,
         c.status in ('accepted', 'client_replied', 'owner_replied') and c.hold_until > now() and c.final_price is not null,
         coalesce((select jsonb_agg(jsonb_build_object('sender', m.sender, 'kind', m.kind, 'body', m.body,
                                                       'offer', m.offer, 'at', m.created_at) order by m.created_at)
                   from public.custom_request_messages m where m.request_id = c.id), '[]'::jsonb)
  from public.custom_requests c
  where length(coalesce(p_token, '')) >= 40 and c.pay_token = p_token
  limit 1;
$$;

-- 12. Ready to pay? Used by the custom-requests function before opening Stripe.
-- Paying the deposit is how the client accepts the offer.
create or replace function public.start_custom_deposit(p_token text)
returns table (booking_id text, deposit_amount numeric, email text, final_date date, final_time time,
               stripe_session_id text, hold_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.custom_requests%rowtype;
  b public.bookings%rowtype;
begin
  if length(coalesce(p_token, '')) < 40 then raise exception 'not_found'; end if;
  select * into c from public.custom_requests r where r.pay_token = p_token;
  if not found then raise exception 'not_found'; end if;
  if c.status = 'booked' then raise exception 'already_paid'; end if;
  if c.status not in ('accepted', 'client_replied', 'owner_replied') or c.final_price is null or c.booking_id is null then
    raise exception 'not_available';
  end if;
  if c.hold_until is null or c.hold_until <= now() then
    update public.custom_requests r set status = 'expired' where r.id = c.id and r.status = 'accepted';
    raise exception 'hold_expired';
  end if;

  select * into b from public.bookings x where x.id::text = c.booking_id;
  if not found or b.status = 'cancelled' then raise exception 'not_available'; end if;
  if b.status in ('confirmed', 'completed') then raise exception 'already_paid'; end if;

  return query select c.booking_id, c.deposit_amount, c.email, c.final_date, c.final_time, b.stripe_session_id, c.hold_until;
end;
$$;

-- 13. When the deposit is paid (booking confirmed), mark the request as booked
create or replace function public.mark_custom_request_booked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.custom_request_id is not null and new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    update public.custom_requests set status = 'booked' where id = new.custom_request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists custom_request_booked on public.bookings;
create trigger custom_request_booked
  after update of status on public.bookings
  for each row execute function public.mark_custom_request_booked();

-- 14. Who can call what
revoke all on function public.submit_custom_request(uuid, text, text, text, text, text, int, numeric, date, time) from public, anon, authenticated;
revoke all on function public.custom_request_link(uuid) from public, anon, authenticated;
revoke all on function public.release_custom_hold(uuid) from public, anon, authenticated;
revoke all on function public.send_custom_offer(uuid, numeric, numeric, int, date, time, text, int) from public, anon, authenticated;
revoke all on function public.owner_message_custom_request(uuid, text) from public, anon, authenticated;
revoke all on function public.decline_custom_request(uuid, text) from public, anon, authenticated;
revoke all on function public.client_reply_custom_request(text, text) from public, anon, authenticated;
revoke all on function public.client_decline_custom_request(text, text) from public, anon, authenticated;
revoke all on function public.start_custom_deposit(text) from public, anon, authenticated;
revoke all on function public.custom_request_by_token(text) from public;
revoke all on function public.mark_custom_request_booked() from public, anon, authenticated;

grant execute on function public.submit_custom_request(uuid, text, text, text, text, text, int, numeric, date, time) to service_role;
grant execute on function public.send_custom_offer(uuid, numeric, numeric, int, date, time, text, int) to service_role;
grant execute on function public.owner_message_custom_request(uuid, text) to service_role;
grant execute on function public.decline_custom_request(uuid, text) to service_role;
grant execute on function public.client_reply_custom_request(text, text) to service_role;
grant execute on function public.client_decline_custom_request(text, text) to service_role;
grant execute on function public.start_custom_deposit(text) to service_role;
grant execute on function public.custom_request_by_token(text) to anon, authenticated, service_role;

-- Tidy up the first version of this file, if it was ever run
drop function if exists public.accept_custom_request(uuid, numeric, numeric, int, date, time, text, int);

notify pgrst, 'reload schema';
