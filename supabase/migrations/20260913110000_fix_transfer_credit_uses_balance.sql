-- ============================================================================
-- FIX — transfer bookings measured credit against gross bookings, not balance
--
-- §15 (11.2) decided in Phase 5b that available credit is the credit limit
-- minus the BALANCE — standing bookings minus recorded payments — so that
-- paying an account frees its headroom again. `create_transfer_booking`
-- (Phase 8a) called `agency_outstanding()`, which ignores payments: an agency
-- that had paid its account in full was still refused a transfer as if it had
-- paid nothing. Hotels were switched in 20260913100000 (§15, 21.3); packages
-- already used the balance. Transfers were the last product still wrong.
--
-- The body is the Phase 8a definition, unchanged except for step 4. Same
-- signature, same grants, same error code (P0003).
-- ============================================================================

create or replace function public.create_transfer_booking(
  p_route_id        uuid,
  p_vehicle_type_id uuid,
  p_date            date,
  p_passengers      integer,
  p_vehicles        integer,
  p_guest_name      text,
  p_guest_email     text default null,
  p_guest_phone     text default null,
  p_pickup_time     time default null,
  p_flight_number   text default null,
  p_pickup_notes    text default null,
  p_promo_code      text default null
)
returns table (booking_id uuid, reference text, total_sell numeric, currency_code char(3))
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_id   uuid := public.current_agency_id();
  v_agency      record;
  v_offer       record;
  v_promo       record;
  v_balance     numeric;
  v_subtotal    numeric;
  v_discount    numeric := 0;
  v_tax_percent numeric := 0;
  v_tax_amount  numeric := 0;
  v_total       numeric;
  v_net         numeric;
  v_promo_code  text := null;
  v_promo_id    uuid := null;
  v_reference   text;
  v_booking_id  uuid;
begin
  if not public.is_active_user() or v_agency_id is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if p_date < current_date then
    raise exception 'A transfer cannot be booked for a past date.' using errcode = '22023';
  end if;

  -- 1. Re-derive the offer from the one search function (§15, 7.3).
  select * into v_offer
  from public.search_transfers(p_date, p_passengers)
  where route_id = p_route_id
    and vehicle_type_id = p_vehicle_type_id
  limit 1;

  if v_offer is null then
    raise exception 'That transfer is no longer available.' using errcode = 'P0002';
  end if;

  -- The search prices ONE vehicle. This booking is for p_vehicles of them.
  v_subtotal := v_offer.sell_per_vehicle * p_vehicles;

  -- 2. Discount.
  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    select * into v_promo
    from public.evaluate_promo_code(p_promo_code, v_agency_id, v_subtotal, p_date);

    if v_promo.reason <> 'ok' then
      raise exception 'Promotion code cannot be used: %', v_promo.reason using errcode = 'P0004';
    end if;

    v_discount   := v_promo.discount;
    v_promo_code := v_promo.code;
    v_promo_id   := v_promo.promo_id;
  end if;

  -- 3. Tax.
  select percent into v_tax_percent
  from public.tax_rates where is_default and is_active limit 1;

  v_tax_percent := coalesce(v_tax_percent, 0);
  v_tax_amount  := round((v_subtotal - v_discount) * v_tax_percent / 100, 2);
  v_total       := v_subtotal - v_discount + v_tax_amount;

  -- 4. Credit, against what the agency owes after its payments (§15, 11.2).
  select a.credit_limit, a.name, a.code into v_agency
  from public.agencies a where a.id = v_agency_id;

  v_balance := public.agency_balance(v_agency_id);

  if v_balance + v_total > coalesce(v_agency.credit_limit, 0) then
    raise exception 'This booking would exceed the agency credit limit.'
      using errcode = 'P0003',
            detail = format('balance=%s booking=%s limit=%s',
                            v_balance, v_total, coalesce(v_agency.credit_limit, 0));
  end if;

  -- 5. The booking. A transfer is a single-day product: check_out = check_in
  --    and nights = 0, which the product-aware constraint requires.
  v_reference := 'LLT-B-' || lpad(nextval('public.booking_ref_seq')::text, 6, '0');

  insert into public.bookings (
    reference, agency_id, agency_name, agency_code, created_by, status, product_type,
    check_in, check_out, nights,
    lead_guest_name, lead_guest_email, lead_guest_phone, special_requests,
    adults, children, rooms, currency_code,
    subtotal_sell, discount_amount, promo_code, tax_rate_percent, tax_amount, total_sell
  ) values (
    v_reference, v_agency_id, v_agency.name, v_agency.code, auth.uid(), 'pending', 'transfer',
    p_date, p_date, 0,
    p_guest_name, p_guest_email, p_guest_phone, p_pickup_notes,
    p_passengers, 0, p_vehicles, v_offer.currency_code,
    v_subtotal, v_discount, v_promo_code, v_tax_percent, v_tax_amount, v_total
  )
  returning id into v_booking_id;

  insert into public.transfer_items (
    booking_id, route_id, vehicle_type_id, route_code,
    from_name_ar, from_name_en, to_name_ar, to_name_en, city_ar, city_en, direction,
    vehicle_name_ar, vehicle_name_en, max_passengers,
    transfer_date, pickup_time, flight_number, pickup_notes,
    passengers, vehicles, currency_code, sell_per_vehicle, sell_total
  ) values (
    v_booking_id, p_route_id, p_vehicle_type_id, v_offer.route_code,
    v_offer.from_name_ar, v_offer.from_name_en, v_offer.to_name_ar, v_offer.to_name_en,
    v_offer.city_ar, v_offer.city_en, v_offer.direction,
    v_offer.vehicle_name_ar, v_offer.vehicle_name_en, v_offer.max_passengers,
    p_date, p_pickup_time, p_flight_number, p_pickup_notes,
    p_passengers, p_vehicles, v_offer.currency_code,
    v_offer.sell_per_vehicle, v_subtotal
  );

  -- 6. The cost, in the table agents cannot read (§15, 14.1).
  v_net := public.transfer_net_total(p_route_id, p_vehicle_type_id, p_date, p_vehicles);
  insert into public.booking_costs (booking_id, net_total, currency_code, sell_total)
  values (v_booking_id, v_net, v_offer.currency_code, v_total);

  if v_promo_id is not null then
    insert into public.promo_code_redemptions (promo_code_id, booking_id, agency_id, discount_amount)
    values (v_promo_id, v_booking_id, v_agency_id, v_discount);
  end if;

  perform public.write_audit('create', 'bookings', v_booking_id::text,
                             jsonb_build_object('reference', v_reference, 'product', 'transfer',
                                                'total', v_total, 'vehicles', p_vehicles));

  return query select v_booking_id, v_reference, v_total, v_offer.currency_code;
end;
$$;

revoke all on function public.create_transfer_booking(uuid, uuid, date, integer, integer, text, text, text, time, text, text, text) from public, anon;
grant execute on function public.create_transfer_booking(uuid, uuid, date, integer, integer, text, text, text, time, text, text, text) to authenticated;
