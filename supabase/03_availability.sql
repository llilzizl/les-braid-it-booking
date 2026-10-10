-- ==========================================================
-- Les Braid It: 03 availability, services and admin tools
-- Run this in Supabase after 01_profiles.sql and 02_bookings.sql:
-- Dashboard > SQL Editor > New query > paste > Run
--
-- Safe to run more than once. It gives the booking calendar
-- real data: your working hours, blocked days, how long each
-- style takes, and the gap needed after each one.
-- ==========================================================

-- 1. Bookings remember how long they take
alter table public.bookings add column if not exists duration_minutes int;
alter table public.bookings add column if not exists buffer_minutes int not null default 0;

-- New bookings start as pending until the deposit is paid
alter table public.bookings alter column status set default 'pending';

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled'));

-- Only paid (confirmed) bookings lock a start time in the database.
-- Unpaid pending bookings expire after 30 minutes, so they must not
-- block the slot forever. The calendar hides overlapping times itself.
drop index if exists public.bookings_one_per_slot;
create unique index if not exists bookings_one_confirmed_per_slot
  on public.bookings (booking_date, booking_time)
  where status in ('confirmed', 'completed');

-- 2. Helper: is the signed-in person an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 3. Services: deposit, length and gap after each style
create table if not exists public.services (
  name             text primary key,
  deposit_amount   numeric not null,
  duration_minutes int,
  buffer_minutes   int not null default 0,
  active           boolean not null default true
);

insert into public.services (name, deposit_amount, duration_minutes, buffer_minutes, active) values
  ('The ''Perfect'' Sew In Classes', 200, null, 0, false),
  ('Extra Small Layered Box Braid', 50, 450, 20, true),
  ('Small Knotless BOHO French Curl', 40, 420, 20, true),
  ('Small Layered Knotless Braids', 30, 360, 20, true),
  ('Micro Braids w/Sew In', 30, 360, 20, true),
  ('Straight Pick & Drop Boho Braids', 30, 390, 20, true),
  ('Smedium Knotless BOHO French Curl', 30, 330, 15, true),
  ('Smedium Layered Knotless Braids', 30, 300, 15, true),
  ('The ''Perfect'' Sew In', 30, 300, 15, true),
  ('''Cassie'' Small Knotless BOHO French Curl', 30, 300, 15, true),
  ('The ''Perfect'' U Part Install', 30, 240, 10, true),
  ('Patewo/Shuku and Base', 30, 240, 10, true),
  ('Small Lemonade Braids', 30, 240, 10, true),
  ('Flip Over (Minimal leave out - Ivy Method)', 30, 240, 10, true),
  ('Extra Small Layered Braids Takedown', 30, 180, 10, true),
  ('Fulani Sew In', 30, 180, 10, true),
  ('Cassie Sew In', 20, 180, 10, true),
  ('Fulani Crotchet', 20, 135, 10, true),
  ('Flat Twist', 20, 120, 10, true),
  ('Small Mini Twist / Mini Braids', 20, 120, 10, true),
  ('The ''Perfect'' Sew In Takedown', 20, 120, 10, true),
  ('Fulani Style', 20, 90, 10, true),
  ('Shuku/Patewo (and Base)', 20, 90, 10, true)
on conflict (name) do update set
  deposit_amount = excluded.deposit_amount,
  duration_minutes = excluded.duration_minutes,
  buffer_minutes = excluded.buffer_minutes,
  active = excluded.active;

-- 4. Working hours (0 = Sunday ... 6 = Saturday) and blocked days
create table if not exists public.working_hours (
  day_of_week int primary key check (day_of_week between 0 and 6),
  is_open     boolean not null default false,
  open_time   time,
  close_time  time
);

-- Starting hours. Change them any time from admin.html.
-- "do nothing" means re-running this file never overwrites your edits.
insert into public.working_hours (day_of_week, is_open, open_time, close_time) values
  (0, true,  '11:00', '20:00'),
  (1, false, null, null),
  (2, false, null, null),
  (3, false, null, null),
  (4, false, null, null),
  (5, true,  '08:00', '21:30'),
  (6, true,  '09:00', '22:30')
on conflict (day_of_week) do nothing;

create table if not exists public.blocked_dates (
  blocked_date date primary key,
  reason       text
);

-- 5. Security rules: everyone can read, only admins can change
alter table public.services      enable row level security;
alter table public.working_hours enable row level security;
alter table public.blocked_dates enable row level security;

drop policy if exists "anyone reads services" on public.services;
create policy "anyone reads services" on public.services for select using (true);
drop policy if exists "admins manage services" on public.services;
create policy "admins manage services" on public.services for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "anyone reads hours" on public.working_hours;
create policy "anyone reads hours" on public.working_hours for select using (true);
drop policy if exists "admins manage hours" on public.working_hours;
create policy "admins manage hours" on public.working_hours for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "anyone reads blocked" on public.blocked_dates;
create policy "anyone reads blocked" on public.blocked_dates for select using (true);
drop policy if exists "admins manage blocked" on public.blocked_dates;
create policy "admins manage blocked" on public.blocked_dates for all
  using (public.is_admin()) with check (public.is_admin());

-- 6. Busy times for the calendar, without exposing client details.
-- A booking blocks its own length plus the gap after it. Bookings saved
-- without a length use the style's length from the services table.
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
