-- ==========================================================
-- Les Braid It: 10 members see their own custom requests
-- Run in Supabase after 09_custom_requests.sql:
-- Dashboard > SQL Editor > New query > paste > Run
-- Safe to run more than once.
--
-- Lets a signed-in member read (never change) their own custom
-- requests, the conversation and their photos, so they show on
-- member-dashboard.html. A request counts as theirs if it was sent
-- while logged in, or with the same email as their account (so
-- requests sent as a guest before signing up show up too, the same
-- rule the bookings table uses).
-- ==========================================================

drop policy if exists "Members read own custom requests" on public.custom_requests;
create policy "Members read own custom requests" on public.custom_requests
  for select to authenticated
  using (
    member_id = (select auth.uid())
    or lower(email) = lower((select auth.jwt() ->> 'email'))
  );

drop policy if exists "Members read own request messages" on public.custom_request_messages;
create policy "Members read own request messages" on public.custom_request_messages
  for select to authenticated
  using (exists (
    select 1 from public.custom_requests c
    where c.id = request_id
      and (c.member_id = (select auth.uid()) or lower(c.email) = lower((select auth.jwt() ->> 'email')))
  ));

drop policy if exists "Members view own request photos" on storage.objects;
create policy "Members view own request photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'custom-requests'
    and exists (
      select 1 from public.custom_requests c
      where c.photo_path = storage.objects.name   -- the file, not the client's name column
        and (c.member_id = (select auth.uid()) or lower(c.email) = lower((select auth.jwt() ->> 'email')))
    )
  );

notify pgrst, 'reload schema';
