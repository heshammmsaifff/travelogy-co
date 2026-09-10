-- ============================================================================
-- FIX — a multi-room booking was charged for ONE room
--
-- `search_availability()` returns `sell_total` **per room for the stay**: its
-- `priced` CTE sums `price_per_night` across the nights and never multiplies by
-- `p_rooms`, which is used only to check that enough rooms are available.
--
-- `create_booking` stored that figure as the booking total. So an agent booking
-- three rooms for two nights paid the price of one room:
--
--     rooms=1  net 3,000  charged 3,450   (correct)
--     rooms=2  net 6,000  charged 3,450   (half price)
--     rooms=3  net 9,000  charged 3,450   (a third)
--
-- Present since Phase 5a. It survived the whole Phase 5 verification suite
-- because every one of those tests booked `p_rooms: 1`, and it survived the
-- browser walkthroughs for the same reason. What surfaced it was Phase 7:
-- `offer_net_total()` DOES multiply by rooms, so the margin went sharply
-- negative and the reports made the discrepancy impossible to miss.
--
-- **The lesson: a parameter that every test passes the same value for is a
-- parameter no test has actually exercised.**
--
-- Nothing needs backfilling — the only affected rows are test fixtures, and
-- correcting historical prices would be inventing a charge nobody agreed to.
-- Any real multi-room booking made before this fix must be re-quoted by a
-- human, not silently repriced by a migration.
-- ============================================================================

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
  p_quotation_id  uuid default null,
  p_promo_code    text default null
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
  v_promo       record;
  v_nights      integer := p_check_out - p_check_in;
  v_outstanding numeric;
  v_room_total  numeric;
  v_subtotal    numeric;
  v_discount    numeric := 0;
  v_tax_amount  numeric := 0;
  v_tax_percent numeric := 0;
  v_total       numeric;
  v_net         numeric;
  v_promo_code  text := null;
  v_promo_id    uuid := null;
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

  -- 1. Re-derive the offer (§15, 7.3 — one source of truth for pricing).
  select *
    into v_offer
  from public.search_availability(p_check_in, p_check_out, p_adults, p_children, p_rooms)
  where room_type_id = p_room_type_id
    and rate_plan_id = p_rate_plan_id
  limit 1;

  if v_offer is null then
    raise exception 'That offer is no longer available.' using errcode = 'P0002';
  end if;

  -- `v_offer.sell_total` is the price of ONE room for the whole stay. The
  -- booking is for `p_rooms` of them.
  v_room_total := v_offer.sell_total;
  v_subtotal   := v_room_total * p_rooms;

  -- 2. Discount, against what is actually being charged.
  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    select * into v_promo
    from public.evaluate_promo_code(p_promo_code, v_agency_id, v_subtotal, p_check_in);

    if v_promo.reason <> 'ok' then
      raise exception 'Promotion code cannot be used: %', v_promo.reason using errcode = 'P0004';
    end if;

    v_discount   := v_promo.discount;
    v_promo_code := v_promo.code;
    v_promo_id   := v_promo.promo_id;
  end if;

  -- 3. Tax, from the configured default.
  select percent into v_tax_percent
  from public.tax_rates
  where is_default and is_active
  limit 1;

  v_tax_percent := coalesce(v_tax_percent, 0);
  v_tax_amount  := round((v_subtotal - v_discount) * v_tax_percent / 100, 2);
  v_total       := v_subtotal - v_discount + v_tax_amount;

  -- 4. Credit, against the amount actually owed.
  select a.credit_limit, a.name, a.code
    into v_agency
  from public.agencies a
  where a.id = v_agency_id;

  v_outstanding := public.agency_outstanding(v_agency_id);

  if v_outstanding + v_total > coalesce(v_agency.credit_limit, 0) then
    raise exception 'This booking would exceed the agency credit limit.'
      using errcode = 'P0003',
            detail = format('outstanding=%s booking=%s limit=%s',
                            v_outstanding, v_total, coalesce(v_agency.credit_limit, 0));
  end if;

  -- 5. Hold the inventory before the booking row exists.
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

  -- 6. The booking.
  v_reference := 'LLT-B-' || lpad(nextval('public.booking_ref_seq')::text, 6, '0');

  insert into public.bookings (
    reference, agency_id, agency_name, agency_code, created_by, quotation_id, status,
    check_in, check_out, nights,
    lead_guest_name, lead_guest_email, lead_guest_phone, special_requests,
    adults, children, rooms, currency_code,
    subtotal_sell, discount_amount, promo_code, tax_rate_percent, tax_amount, total_sell
  ) values (
    v_reference, v_agency_id, v_agency.name, v_agency.code, v_user_id, p_quotation_id, 'pending',
    p_check_in, p_check_out, v_nights,
    p_guest_name, p_guest_email, p_guest_phone, p_requests,
    p_adults, p_children, p_rooms, v_offer.currency_code,
    v_subtotal, v_discount, v_promo_code, v_tax_percent, v_tax_amount, v_total
  )
  returning id into v_booking_id;

  -- `sell_per_night` stays per room per night; `sell_total` is the LINE total,
  -- which is what the invoice prints beside "per night × nights × rooms".
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
    v_offer.sell_per_night, v_subtotal, v_offer.is_refundable
  );

  -- 7. What it cost us, in the table agents cannot read.
  v_net := public.offer_net_total(
    p_room_type_id, p_rate_plan_id, p_check_in, p_check_out, p_adults, p_children, p_rooms
  );

  insert into public.booking_costs (booking_id, net_total, currency_code, sell_total)
  values (v_booking_id, v_net, v_offer.currency_code, v_total);

  if v_promo_id is not null then
    insert into public.promo_code_redemptions (promo_code_id, booking_id, agency_id, discount_amount)
    values (v_promo_id, v_booking_id, v_agency_id, v_discount);
  end if;

  perform public.write_audit('create', 'bookings', v_booking_id::text,
                             jsonb_build_object('reference', v_reference, 'total', v_total,
                                                'rooms', p_rooms));

  return query select v_booking_id, v_reference, v_total, v_offer.currency_code;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text) to authenticated;

-- Make the unit explicit at the source, so the next reader of
-- search_availability() does not have to work it out from the CTE.
comment on function public.search_availability(date, date, integer, integer, integer, text, text, text) is
  'Availability search. sell_total and sell_per_night are PER ROOM — p_rooms only filters on availability. A caller booking N rooms must multiply.';
