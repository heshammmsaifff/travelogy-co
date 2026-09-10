-- ============================================================================
-- Phase 5a fix — the booking RPCs refused every system context
--
-- Found by the Phase 5a verification suite, and it is the SAME defect the
-- standing rule in §15 (5.x) was written to prevent — reintroduced in new code
-- because the rule was applied to guards and not remembered for RPCs.
--
-- `confirm_booking`, `cancel_booking` and `complete_booking` gated on
-- `has_permission(auth.uid(), …)`. Under the service role, from a migration,
-- or from the SQL editor, `auth.uid()` is NULL, so every one of those callers
-- was refused. Consequences:
--
--   * an ops script or a scheduled job could not confirm or cancel anything;
--   * `complete_booking` is exactly the kind of thing a nightly job should do,
--     and it was unreachable from one;
--   * worse for confidence: four checks in the test suite PASSED while the
--     behaviour they claimed to prove was never exercised. "Confirming twice is
--     refused" passed because the FIRST confirm was refused. A test that passes
--     on the wrong error proves nothing.
--
-- Safe for the same reason as before: every RLS policy on these tables is
-- scoped `to authenticated`, so a null `auth.uid()` here means Postgres itself,
-- a migration, the service role, or the SQL editor — never an anonymous
-- request from the internet.
-- ============================================================================

create or replace function public.confirm_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.booking_status;
begin
  -- Standing rule (§15, 5.x): a system context is `auth.uid() is null`.
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'bookings.confirm') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select status into v_status from public.bookings where id = p_booking_id;
  if v_status is null then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending booking can be confirmed.' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_booking_id;

  perform public.write_audit('confirm', 'bookings', p_booking_id::text, null);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
  v_item    record;
  v_night   date;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  -- An agent may cancel their own agency's booking; back-office staff need the
  -- permission; a system context (auth.uid() is null) is allowed through.
  if auth.uid() is not null and not (
    public.has_permission(auth.uid(), 'bookings.cancel')
    or (v_booking.agency_id = public.current_agency_id() and public.is_active_user())
  ) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if v_booking.status in ('cancelled', 'completed') then
    raise exception 'This booking can no longer be cancelled.' using errcode = '22023';
  end if;

  for v_item in
    select room_type_id, rooms from public.booking_items
    where booking_id = p_booking_id and room_type_id is not null
  loop
    v_night := v_booking.check_in;
    while v_night < v_booking.check_out loop
      update public.allocations
         set sold = greatest(sold - v_item.rooms, 0)
       where room_type_id = v_item.room_type_id
         and stay_date = v_night;
      v_night := v_night + 1;
    end loop;
  end loop;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancellation_reason = p_reason
   where id = p_booking_id;

  perform public.write_audit('cancel', 'bookings', p_booking_id::text,
                             jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
begin
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'bookings.confirm') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only a confirmed booking can be completed.' using errcode = '22023';
  end if;
  if v_booking.check_out > current_date then
    raise exception 'This stay has not finished yet.' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'completed', completed_at = now()
   where id = p_booking_id;

  perform public.write_audit('complete', 'bookings', p_booking_id::text, null);
end;
$$;
