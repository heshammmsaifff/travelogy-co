-- ============================================================================
-- Phase 10: Buyer B2B REST API (System-to-System Distribution / XML Out)
-- Hotels B2B Hub §6.5, §7.2 & CLAUDE.md Decision 20.3
-- ============================================================================

-- 1. Agency API Keys table
create table if not exists public.agency_api_keys (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references public.agencies(id) on delete cascade,
  name                  text not null,
  key_prefix            text not null,
  key_hash              text not null unique,
  is_active             boolean not null default true,
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 3000),
  allowed_ips           text[] default null,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  last_used_at          timestamptz default null,
  expires_at            timestamptz default null
);

create index if not exists idx_agency_api_keys_hash on public.agency_api_keys(key_hash) where is_active;
create index if not exists idx_agency_api_keys_agency on public.agency_api_keys(agency_id);

-- RLS
alter table public.agency_api_keys enable row level security;

create policy agency_api_keys_select on public.agency_api_keys
  for select using (
    agency_id = public.current_agency_id()
    or public.has_permission(auth.uid(), 'agencies.view')
  );

create policy agency_api_keys_insert on public.agency_api_keys
  for insert with check (
    agency_id = public.current_agency_id()
    or public.has_permission(auth.uid(), 'agencies.update')
  );

create policy agency_api_keys_update on public.agency_api_keys
  for update using (
    agency_id = public.current_agency_id()
    or public.has_permission(auth.uid(), 'agencies.update')
  );

create policy agency_api_keys_delete on public.agency_api_keys
  for delete using (
    agency_id = public.current_agency_id()
    or public.has_permission(auth.uid(), 'agencies.update')
  );

-- 2. Fast API Key authentication function
create or replace function public.authenticate_b2b_api_key(p_key_hash text)
returns table (
  key_id        uuid,
  agency_id     uuid,
  agency_name   text,
  agency_code   text,
  agency_status text,
  rate_limit    integer,
  allowed_ips   text[]
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec record;
begin
  select
    k.id,
    k.agency_id,
    a.name as agency_name,
    a.code as agency_code,
    a.status::text as agency_status,
    k.rate_limit_per_minute as rate_limit,
    k.allowed_ips
  into v_rec
  from public.agency_api_keys k
  join public.agencies a on a.id = k.agency_id
  where k.key_hash = p_key_hash
    and k.is_active = true
    and (k.expires_at is null or k.expires_at > now());

  if v_rec is not null then
    update public.agency_api_keys
    set last_used_at = now()
    where id = v_rec.id;

    return query select
      v_rec.id,
      v_rec.agency_id,
      v_rec.agency_name,
      v_rec.agency_code,
      v_rec.agency_status,
      v_rec.rate_limit,
      v_rec.allowed_ips;
  end if;
end;
$$;

revoke all on function public.authenticate_b2b_api_key(text) from public, anon;
grant execute on function public.authenticate_b2b_api_key(text) to authenticated, service_role;

-- 3. Programmatic B2B Booking Creation RPC
create or replace function public.create_b2b_api_booking(
  p_agency_id         uuid,
  p_room_type_id      uuid,
  p_rate_plan_id      uuid,
  p_check_in          date,
  p_check_out         date,
  p_adults            integer,
  p_children          integer,
  p_rooms             integer,
  p_guest_name        text,
  p_guest_email       text default null,
  p_guest_phone       text default null,
  p_requests          text default null,
  p_promo_code        text default null,
  p_client_reference  text default null
)
returns table (
  booking_id    uuid,
  reference     text,
  total_sell    numeric,
  currency_code char(3),
  status        text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency      record;
  v_offer       record;
  v_promo       record;
  v_nights      integer := p_check_out - p_check_in;
  v_room_total  numeric;
  v_subtotal    numeric;
  v_discount    numeric := 0;
  v_tax_amount  numeric := 0;
  v_tax_percent numeric := 0;
  v_total       numeric;
  v_net         numeric;
  v_promo_text  text := null;
  v_promo_id    uuid := null;
  v_reference   text;
  v_booking_id  uuid;
  v_night       date;
  v_available   numeric;
begin
  -- Validate agency
  select * into v_agency from public.agencies where id = p_agency_id;
  if v_agency is null or v_agency.status <> 'active' then
    raise exception 'Agency is not active or not approved.' using errcode = '42501';
  end if;

  if v_nights < 1 or v_nights > 30 then
    raise exception 'A stay must be between 1 and 30 nights.' using errcode = '22023';
  end if;

  if p_rooms < 1 or p_rooms > 9 then
    raise exception 'Rooms must be between 1 and 9.' using errcode = '22023';
  end if;

  -- 1. Re-derive the offer
  select *
    into v_offer
  from public.search_availability(p_check_in, p_check_out, p_adults, p_children, p_rooms)
  where room_type_id = p_room_type_id
    and rate_plan_id = p_rate_plan_id
  limit 1;

  if v_offer is null then
    raise exception 'That offer is no longer available.' using errcode = 'P0002';
  end if;

  v_room_total := v_offer.sell_total;
  v_subtotal   := v_room_total * p_rooms;

  -- 2. Discount
  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    select * into v_promo
    from public.evaluate_promo_code(p_promo_code, p_agency_id, v_subtotal, p_check_in);

    if v_promo.reason <> 'ok' then
      raise exception 'Promotion code cannot be used: %', v_promo.reason using errcode = 'P0004';
    end if;

    v_discount   := v_promo.discount;
    v_promo_text := v_promo.code;
    v_promo_id   := v_promo.promo_id;
  end if;

  -- 3. Tax
  select percent into v_tax_percent
  from public.tax_rates
  where is_default and is_active
  limit 1;

  v_tax_percent := coalesce(v_tax_percent, 0);
  v_tax_amount  := round((v_subtotal - v_discount) * v_tax_percent / 100, 2);
  v_total       := v_subtotal - v_discount + v_tax_amount;

  -- 4. Credit Limit Check
  v_available := public.agency_available_credit(p_agency_id);
  if (v_available - v_total) < 0 then
    raise exception 'Credit limit exceeded. Required: %, Available: %', v_total, v_available
      using errcode = 'P0001';
  end if;

  -- 5. Atomic Inventory Hold
  v_night := p_check_in;
  while v_night < p_check_out loop
    update public.allocations
    set sold = sold + p_rooms
    where room_type_id = p_room_type_id
      and stay_date = v_night
      and not stop_sell
      and (sold + p_rooms) <= allotment;

    if not found then
      raise exception 'Room allotment unavailable for night %.', v_night
        using errcode = 'P0003';
    end if;

    v_night := v_night + 1;
  end loop;

  -- 6. Generate Reference & Insert Booking
  v_reference := public.generate_booking_reference();

  insert into public.bookings (
    agency_id,
    agency_name,
    agency_code,
    product_type,
    status,
    currency_code,
    total_sell,
    subtotal,
    discount_amount,
    tax_rate_percent,
    tax_amount,
    promo_code,
    reference,
    created_by,
    check_in,
    check_out,
    nights,
    adults,
    children,
    rooms,
    lead_guest_name,
    guest_email,
    guest_phone,
    special_requests
  ) values (
    p_agency_id,
    v_agency.name,
    v_agency.code,
    'hotel',
    'pending',
    v_offer.currency_code,
    v_total,
    v_subtotal,
    v_discount,
    v_tax_percent,
    v_tax_amount,
    v_promo_text,
    v_reference,
    null, -- API integration created
    p_check_in,
    p_check_out,
    v_nights,
    p_adults,
    p_children,
    p_rooms,
    p_guest_name,
    p_guest_email,
    p_guest_phone,
    case
      when p_client_reference is not null and btrim(p_client_reference) <> '' then
        coalesce(p_requests, '') || E'\nClient Ref: ' || p_client_reference
      else p_requests
    end
  )
  returning id into v_booking_id;

  -- 7. Insert Item
  insert into public.booking_items (
    booking_id,
    hotel_id,
    room_type_id,
    rate_plan_id,
    cancellation_policy_id,
    item_type,
    room_name_ar,
    room_name_en,
    rate_plan_name_ar,
    rate_plan_name_en,
    meal_plan_key,
    price_per_night,
    total_price,
    cancellation_deadline
  ) values (
    v_booking_id,
    v_offer.hotel_id,
    p_room_type_id,
    p_rate_plan_id,
    v_offer.cancellation_policy_id,
    'room',
    v_offer.room_name_ar,
    v_offer.room_name_en,
    v_offer.plan_name_ar,
    v_offer.plan_name_en,
    v_offer.meal_plan_key,
    v_offer.sell_per_night,
    v_room_total,
    case
      when v_offer.free_cancellation_before is not null
      then v_offer.free_cancellation_before::timestamptz
      else null
    end
  );

  -- 8. Record Net Cost in booking_costs
  v_net := public.offer_net_total(p_rate_plan_id, p_room_type_id, p_check_in, p_check_out) * p_rooms;
  insert into public.booking_costs (
    booking_id,
    currency_code,
    net_cost,
    recorded_at
  ) values (
    v_booking_id,
    v_offer.currency_code,
    v_net,
    now()
  );

  -- 9. Promo redemption if applicable
  if v_promo_id is not null then
    insert into public.promo_code_redemptions (promo_code_id, booking_id, agency_id, discount_applied)
    values (v_promo_id, v_booking_id, p_agency_id, v_discount);
  end if;

  -- 10. Audit log
  perform public.write_audit(
    'booking.b2b_api_created',
    'bookings',
    v_booking_id::text,
    jsonb_build_object(
      'reference', v_reference,
      'agency_id', p_agency_id,
      'total_sell', v_total,
      'client_reference', p_client_reference
    )
  );

  return query select
    v_booking_id,
    v_reference,
    v_total,
    v_offer.currency_code,
    'pending'::text;
end;
$$;

revoke all on function public.create_b2b_api_booking(uuid, uuid, uuid, date, date, integer, integer, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_b2b_api_booking(uuid, uuid, uuid, date, date, integer, integer, integer, text, text, text, text, text, text) to authenticated, service_role;
