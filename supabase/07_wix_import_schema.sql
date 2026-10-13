-- ==========================================================
-- Les Braid It: 07 places for your old Wix data
-- Run in Supabase after 06_addon_prices.sql:
-- Dashboard > SQL Editor > New query > paste > Run
--
-- This only makes empty tables and one extra column. It contains
-- no client data. The data itself comes in a separate private file.
-- Safe to run more than once.
-- ==========================================================

-- 1. Bookings imported from Wix are marked, and can't be imported twice
alter table public.bookings add column if not exists source text not null default 'website';
alter table public.bookings add column if not exists external_ref text;
alter table public.bookings add column if not exists price numeric;
alter table public.bookings add column if not exists payment_status text default 'pending';
-- An older bookings table may only allow a few payment_status words. Remove that limit.
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.bookings'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%payment_status%'
  loop
    execute format('alter table public.bookings drop constraint %I', r.conname);
  end loop;
end $$;

create unique index if not exists bookings_external_ref_idx on public.bookings (external_ref);

-- 2. Client list (name and contact details, only you can see it)
create table if not exists public.clients (
  email        text primary key,
  first_name   text,
  last_name    text,
  phone        text,
  signed_up    date,
  source       text not null default 'wix',
  marketing_ok boolean not null default false
);
comment on column public.clients.marketing_ok is
  'true only if the client agreed to marketing emails. Imported Wix contacts are false.';

-- 3. Daily sales from your Wix sales report (for the revenue chart)
create table if not exists public.sales_daily (
  day          date primary key,
  total_sales  numeric not null default 0,
  orders       int not null default 0,
  refunded     numeric not null default 0,
  discount     numeric not null default 0,
  source       text not null default 'wix'
);

-- 4. Only admins can see or change these
alter table public.clients     enable row level security;
alter table public.sales_daily enable row level security;

drop policy if exists "admins manage clients" on public.clients;
create policy "admins manage clients" on public.clients for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage sales" on public.sales_daily;
create policy "admins manage sales" on public.sales_daily for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.clients, public.sales_daily from anon;

notify pgrst, 'reload schema';
