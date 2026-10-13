-- ==========================================================
-- Les Braid It: 05 lock the bookings table
-- Run this LAST, only after the Stripe functions are deployed and a
-- test payment has worked (see supabase/STRIPE_SETUP.md).
--
-- Until now the website could create bookings directly. After this,
-- bookings can only be created by the create-checkout function, so
-- nobody can skip the deposit. Safe to run more than once.
-- ==========================================================

-- Remove every rule that lets visitors insert a booking themselves
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bookings' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.bookings', r.policyname);
  end loop;
end $$;

revoke insert on public.bookings from anon, authenticated;

notify pgrst, 'reload schema';
