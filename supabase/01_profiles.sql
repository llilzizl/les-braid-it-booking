-- ==========================================================
-- Les Braid It — 01: member profiles
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run
-- ==========================================================

-- One profile row per member, linked to their Supabase login (auth.users)
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text not null default '',
  phone             text,
  style_preferences text,
  is_admin          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Members can only see their own profile
drop policy if exists "Members can view own profile" on public.profiles;
create policy "Members can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Members can only edit their own profile...
drop policy if exists "Members can update own profile" on public.profiles;
create policy "Members can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ...and only these columns, so nobody can make themselves an admin
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, style_preferences) on public.profiles to authenticated;

-- Keep updated_at current
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile automatically when someone signs up,
-- using the name and phone they entered on the sign up form
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- To make yourself the admin after you sign up on the site, run (with your email):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
