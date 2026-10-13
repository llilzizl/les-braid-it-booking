-- ==========================================================
-- Les Braid It: 08 confirmation emails
-- Run in Supabase after 04_payments.sql:
-- Dashboard > SQL Editor > New query > paste > Run
-- Safe to run more than once.
-- ==========================================================

-- Remembers that a booking's confirmation email has been sent, so a
-- repeated Stripe notification can never send it twice.
alter table public.bookings add column if not exists confirmation_sent_at timestamptz;
alter table public.bookings add column if not exists reminder_sent_at timestamptz;

-- Claims the right to send the confirmation. Returns the booking details
-- the first time only, and nothing if it was already claimed.
create or replace function public.claim_confirmation_email(p_booking text)
returns table (
  name text, email text, service_type text, addons text,
  booking_date date, booking_time time, duration_minutes int,
  deposit_amount numeric, price numeric
)
language sql
security definer
set search_path = public
as $$
  update public.bookings b
  set confirmation_sent_at = now()
  where b.id::text = p_booking
    and b.status = 'confirmed'
    and b.confirmation_sent_at is null
  returning b.name, b.email, b.service_type, b.addons,
            b.booking_date, b.booking_time, b.duration_minutes,
            b.deposit_amount, b.price;
$$;

-- If sending fails, give the claim back so it can be sent later
create or replace function public.release_confirmation_email(p_booking text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings set confirmation_sent_at = null where id::text = p_booking;
$$;

revoke all on function public.claim_confirmation_email(text) from public, anon, authenticated;
revoke all on function public.release_confirmation_email(text) from public, anon, authenticated;
grant execute on function public.claim_confirmation_email(text) to service_role;
grant execute on function public.release_confirmation_email(text) to service_role;

notify pgrst, 'reload schema';
