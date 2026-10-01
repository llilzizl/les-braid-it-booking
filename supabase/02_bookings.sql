-- ==========================================================
-- Les Braid It — 02: bookings
-- Run this once in Supabase, after 01_profiles.sql:
-- Dashboard > SQL Editor > New query > paste > Run
-- ==========================================================

-- One row per appointment. Guests and members both book here;
-- member_id is filled in when the client was logged in.
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references auth.users (id) on delete set null,
  name          text not null,
  email         text not null,
  phone         text not null,
  service_type  text not null,
  addons        text,
  booking_date  date not null,
  booking_time  time not null,
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at    timestamptz not null default now()
);

-- Stop two bookings landing on the same slot (cancelled ones free it up again)
create unique index if not exists bookings_one_per_slot
  on public.bookings (booking_date, booking_time)
  where status <> 'cancelled';

alter table public.bookings enable row level security;

-- Anyone can make a booking from the website. It always starts as 'pending',
-- and a member can only attach a booking to their own account.
drop policy if exists "Anyone can create a booking" on public.bookings;
create policy "Anyone can create a booking"
  on public.bookings for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and (member_id is null or member_id = (select auth.uid()))
  );

-- Members can see their own bookings, including ones they made as a guest
-- with the same email before signing up (these count towards the loyalty card)
drop policy if exists "Members can view own bookings" on public.bookings;
create policy "Members can view own bookings"
  on public.bookings for select
  to authenticated
  using (
    member_id = (select auth.uid())
    or lower(email) = lower((select auth.jwt() ->> 'email'))
  );

-- The admin (you) can see and update every booking, e.g. to mark one as completed
drop policy if exists "Admin can view all bookings" on public.bookings;
create policy "Admin can view all bookings"
  on public.bookings for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));

drop policy if exists "Admin can update bookings" on public.bookings;
create policy "Admin can update bookings"
  on public.bookings for update
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));
