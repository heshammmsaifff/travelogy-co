-- ============================================================================
-- Phase 5a fix — a booking now carries the agency's name and code
--
-- Found by walking the back-office as a "Reservations Officer" — a custom role
-- holding exactly `bookings.view_all`, `bookings.confirm` and
-- `bookings.cancel`. The bookings list showed "—" in the agency column for
-- every row.
--
-- Nothing was broken: RLS on `agencies` requires `agencies.view`, which that
-- role does not hold, so the nested read correctly returned nothing. But the
-- result is a reservations screen that cannot tell you whose booking it is,
-- and the fix is NOT to widen the role — that would hand a reservations
-- officer the whole agency directory, credit limits included, to render one
-- column.
--
-- Instead the booking carries the name and code itself, snapshotted at
-- creation. Consistent with how every other record in this phase works
-- (§15, 9.4): a booking, like a voucher, must still read correctly later —
-- including after the company is renamed, and to a reader who cannot open the
-- company record at all.
-- ============================================================================

alter table public.bookings
  add column agency_name text,
  add column agency_code text;

comment on column public.bookings.agency_name is
  'Snapshot of the agency name at booking time. Lets a reservations role read the list without needing agencies.view, and keeps an old booking readable after a rename.';

-- Backfill what already exists, so the column is not half-populated.
update public.bookings b
   set agency_name = a.name,
       agency_code = a.code
  from public.agencies a
 where a.id = b.agency_id
   and b.agency_name is null;

-- ----------------------------------------------------------------------------
-- create_booking now records them.
--
-- Repeated in full rather than patched: `create or replace function` has no
-- partial form, and a booking function that drifted from its migration would
-- be worse than the duplication.
-- ----------------------------------------------------------------------------

create or replace function public.create_booking(
  p_room_type_id  uuid,
  p_rate_plan_id  uuid,
  p_check_in      date,
  p_check_out     date,
  p_adults        integer,
  p_children      integer,
  p_rooms         integer,
  p_guest_name    text,
  p_guest_email   text default null,
  p_guest_phone   text default null,
  p_requests      text default null,
  p_quotation_id  uuid default null
)
returns table (booking_id uuid, reference text, total_sell numeric, currency_code char(3))
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_id   uuid := public.current_agency_id();
  v_user_id     uuid := auth.uid();
  v_agency      record;
  v_offer       record;
  v_nights      integer := p_check_out - p_check_in;
  v_outstanding numeric;
  v_reference   text;
  v_booking_id  uuid;
  v_night       date;
begin
  if not public.is_active_user() or v_agency_id is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if v_nights < 1 or v_nights > 30 then
    raise exception 'A stay must be between 1 and 30 nights.' using errcode = '22023';
  end if;

  -- 1. Re-derive the offer. search_availability() is the single source of
  --    truth for price and availability (§15, 7.3).
  select *
    into v_offer
  from public.search_availability(p_check_in, p_check_out, p_adults, p_children, p_rooms)
  where room_type_id = p_room_type_id
    and rate_plan_id = p_rate_plan_id
  limit 1;

  if v_offer is null then
    raise exception 'That offer is no longer available.' using errcode = 'P0002';
  end if;

  -- 2. Credit, and the identity snapshot, from one read of the agency.
  select a.credit_limit, a.name, a.code
    into v_agency
  from public.agencies a
  where a.id = v_agency_id;

  v_outstanding := public.agency_outstanding(v_agency_id);

  if v_outstanding + v_offer.sell_total > coalesce(v_agency.credit_limit, 0) then
    raise exception 'This booking would exceed the agency credit limit.'
      using errcode = 'P0003',
            detail = format('outstanding=%s booking=%s limit=%s',
                            v_outstanding, v_offer.sell_total, coalesce(v_agency.credit_limit, 0));
  end if;

  -- 3. Hold the inventory before the booking row exists.
  v_night := p_check_in;
  while v_night < p_check_out loop
    update public.allocations
       set sold = sold + p_rooms
     where room_type_id = p_room_type_id
       and stay_date = v_night;

    if not found then
      raise exception 'Inventory is not loaded for %.', v_night using errcode = 'P0002';
    end if;

    v_night := v_night + 1;
  end loop;

  -- 4. The booking.
  v_reference := 'LLT-B-' || lpad(nextval('public.booking_ref_seq')::text, 6, '0');

  insert into public.bookings (
    reference, agency_id, agency_name, agency_code, created_by, quotation_id, status,
    check_in, check_out, nights,
    lead_guest_name, lead_guest_email, lead_guest_phone, special_requests,
    adults, children, rooms, currency_code, total_sell
  ) values (
    v_reference, v_agency_id, v_agency.name, v_agency.code, v_user_id, p_quotation_id, 'pending',
    p_check_in, p_check_out, v_nights,
    p_guest_name, p_guest_email, p_guest_phone, p_requests,
    p_adults, p_children, p_rooms, v_offer.currency_code, v_offer.sell_total
  )
  returning id into v_booking_id;

  insert into public.booking_items (
    booking_id, supplier_key, hotel_id, room_type_id, rate_plan_id,
    hotel_name_ar, hotel_name_en, city_ar, city_en, country_code, star_rating,
    room_name_ar, room_name_en, plan_name_ar, plan_name_en, meal_plan_key,
    nights, rooms, currency_code, sell_per_night, sell_total, is_refundable
  ) values (
    v_booking_id, 'internal', v_offer.hotel_id, p_room_type_id, p_rate_plan_id,
    v_offer.name_ar, v_offer.name_en, v_offer.city_ar, v_offer.city_en,
    v_offer.country_code, v_offer.star_rating,
    v_offer.room_name_ar, v_offer.room_name_en,
    v_offer.plan_name_ar, v_offer.plan_name_en, v_offer.meal_plan_key,
    v_nights, p_rooms, v_offer.currency_code,
    v_offer.sell_per_night, v_offer.sell_total, v_offer.is_refundable
  );

  perform public.write_audit('create', 'bookings', v_booking_id::text,
                             jsonb_build_object('reference', v_reference,
                                                'total', v_offer.sell_total));

  return query select v_booking_id, v_reference, v_offer.sell_total, v_offer.currency_code;
end;
$$;

-- ----------------------------------------------------------------------------
-- The snapshot is not the agent's to edit.
--
-- There is no UPDATE policy on `bookings` at all, so this guard exists for the
-- system paths — and so that a later phase adding an update policy cannot
-- accidentally make the identity on a booking editable.
-- ----------------------------------------------------------------------------

create or replace function public.prevent_booking_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.agency_id   is distinct from old.agency_id
     or new.reference  is distinct from old.reference
     or new.total_sell is distinct from old.total_sell then
    raise exception 'A booking''s agency, reference and total cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_booking_identity_change() from public, anon, authenticated;

create trigger bookings_protect_identity
  before update on public.bookings
  for each row execute function public.prevent_booking_identity_change();
