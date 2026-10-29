-- ==========================================================
-- Les Braid It: 18 reference photos on bookings
-- Run in Supabase > SQL Editor > New query > paste > Run.
-- Safe to run more than once.
--
-- Clients can add up to 4 reference photos when they book.
-- The photos go into a PRIVATE storage folder named after the booking,
-- straight after the booking is saved and before they pay.
-- Only you (admin) can view them, on admin.html.
-- ==========================================================

-- 1. Private storage for the photos (max 8 MB each, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-references', 'booking-references', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. The upload rule. A photo can only be added when:
--    - its folder is the id of a real booking (booking ids are long random codes, so they can't be guessed)
--    - that booking is still unpaid and was made in the last 30 minutes (so only the person booking can add photos)
--    - the booking has fewer than 4 photos so far
create or replace function public.booking_accepts_references(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = v_folder::uuid
      and b.status = 'pending'
      and b.created_at > now() - interval '30 minutes'
  ) then
    return false;
  end if;
  return (select count(*) from storage.objects o
          where o.bucket_id = 'booking-references'
            and split_part(o.name, '/', 1) = v_folder) < 4;
end;
$$;

revoke all on function public.booking_accepts_references(text) from public;
grant execute on function public.booking_accepts_references(text) to anon, authenticated;

drop policy if exists "Clients add booking reference photos" on storage.objects;
create policy "Clients add booking reference photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'booking-references' and public.booking_accepts_references(name));

-- 3. Only you can see them
drop policy if exists "Admin views booking reference photos" on storage.objects;
create policy "Admin views booking reference photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'booking-references' and public.is_admin());
