-- ============================================================================
-- FIX — Phase 9/10 review: the B2B booking path, API search, and access holes
--
-- Found by reading the Phase 9/10 migrations against the schema they write to.
-- None of it surfaced on `db push`, because Postgres does not resolve the
-- column names inside a plpgsql body until the function is first executed.
--
-- 1. `create_b2b_api_booking` could never succeed.
--    - it re-derived the price through `search_availability()`, which refuses
--      any caller that is not a signed-in active user — and an API request has
--      no user, so every booking failed as "offer no longer available";
--    - past that, it wrote columns that do not exist (`subtotal`,
--      `guest_email`, `item_type`, `price_per_night`, `net_cost`,
--      `discount_applied` …), called `offer_net_total` with its arguments in
--      the wrong order and three of them missing, and called two functions no
--      migration defines (`generate_booking_reference`,
--      `agency_available_credit`).
--
-- 2. It was also a hole waiting for someone to fix (1). It was GRANTED TO
--    `authenticated` and took `p_agency_id` from the caller, so once it worked
--    any signed-in agent could have booked against ANY agency's credit.
--
-- 3. `agency_api_keys` policies called `has_permission()`, which
--    `authenticated` cannot execute (§15, Phase 4 standing rule), and let any
--    member of an agency INSERT a key directly through PostgREST — bypassing
--    the owner-only check in the server action. A key is booking power over
--    the agency's credit, so that is not a cosmetic difference.
--
-- 4. The API could not search its own inventory: the registry called
--    `search_availability()` on a request with no session.
--
-- The fix follows §15 (7.3): ONE source of truth for pricing and ONE for
-- booking. Instead of a second copy of the booking logic for the API — which
-- is exactly how (1) happened — the existing bodies move into internal
-- `*_for(agency)` functions, and both the portal and the API become thin
-- wrappers that differ only in how they establish WHO is booking.
--
-- Nothing here drops a table or a column. It drops and recreates ONE function
-- (`create_b2b_api_booking`, whose signature changes) and four RLS policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. An API client's own reference, and a duplicate guard on it
--
-- System-to-system callers retry on timeouts. Without an idempotency key a
-- retried POST is a second booking and a second charge against credit.
-- ----------------------------------------------------------------------------

alter table public.bookings
  add column client_reference text
    constraint bookings_client_reference_len
    check (client_reference is null or length(btrim(client_reference)) between 1 and 100);

create unique index bookings_agency_client_reference_uniq
  on public.bookings (agency_id, client_reference)
  where client_reference is not null;

comment on column public.bookings.client_reference is
  'The buyer system''s own reference (B2B API). Unique per agency, so a retried request cannot create a second booking.';

-- ----------------------------------------------------------------------------
-- 2. Availability search, for an explicit agency
--
-- The body is `search_availability()` from 20260907110100, unchanged except
-- that the agency whose markup applies is a parameter rather than the caller's
-- session. Not callable by `authenticated`: the agency id would otherwise be a
-- way to read another agency's negotiated prices.
-- ----------------------------------------------------------------------------

create or replace function public.search_availability_for(
  p_agency_id   uuid,
  p_check_in    date,
  p_check_out   date,
  p_adults      integer default 2,
  p_children    integer default 0,
  p_rooms       integer default 1,
  p_country     text default null,
  p_city        text default null,
  p_query       text default null
)
returns table (
  hotel_id          uuid,
  hotel_code        text,
  name_ar           text,
  name_en           text,
  city_ar           text,
  city_en           text,
  country_code      char(2),
  star_rating       smallint,
  property_type     public.property_type,
  cover_url         text,
  room_type_id      uuid,
  room_code         text,
  room_name_ar      text,
  room_name_en      text,
  max_occupancy     smallint,
  rate_plan_id      uuid,
  plan_name_ar      text,
  plan_name_en      text,
  meal_plan_key     text,
  currency_code     char(3),
  nights            integer,
  sell_total        numeric,
  sell_per_night    numeric,
  rooms_available   integer,
  is_refundable     boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nights     integer := p_check_out - p_check_in;
  v_guests     integer := p_adults + p_children;
begin
  -- A suspended or pending agency gets no prices, whichever door it came in by.
  if p_agency_id is not null and not exists (
    select 1 from public.agencies a where a.id = p_agency_id and a.status = 'active'
  ) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if v_nights < 1 then
    raise exception 'Check-out must be after check-in.' using errcode = '22023';
  end if;

  if v_nights > 30 then
    raise exception 'A stay cannot exceed 30 nights.' using errcode = '22023';
  end if;

  return query
  with nights as (
    select generate_series(p_check_in, p_check_out - 1, interval '1 day')::date as stay_date
  ),
  candidate as (
    select
      h.id as hotel_id, h.code as hotel_code, h.name_ar, h.name_en,
      h.city_ar, h.city_en, h.country_code, h.star_rating, h.property_type,
      rt.id as room_type_id, rt.code as room_code,
      rt.name_ar as room_name_ar, rt.name_en as room_name_en,
      rt.max_occupancy, rt.standard_occupancy,
      rp.id as rate_plan_id, rp.name_ar as plan_name_ar, rp.name_en as plan_name_en,
      rp.meal_plan_key, rp.currency_code, rp.cancellation_policy_id
    from public.hotels h
    join public.room_types rt on rt.hotel_id = h.id and rt.status = 'active'
    join public.rate_plans rp on rp.hotel_id = h.id and rp.status = 'active'
                             and rp.valid_from <= p_check_in
                             and rp.valid_to   >= p_check_out - 1
    where h.status = 'active'
      and rt.max_occupancy >= v_guests
      and (p_country is null or h.country_code = upper(p_country))
      and (p_city is null or h.city_en ilike p_city or h.city_ar ilike p_city)
      and (
        p_query is null
        or h.name_en ilike '%' || p_query || '%'
        or h.name_ar ilike '%' || p_query || '%'
        or h.city_en ilike '%' || p_query || '%'
        or h.city_ar ilike '%' || p_query || '%'
      )
  ),
  priced as (
    select
      c.*,
      count(n.stay_date)                                as nights_covered,
      sum(r.price_per_night)                            as net_room_total,
      sum(greatest(p_adults - c.standard_occupancy, 0) * r.extra_adult_price) as net_extra_adults,
      sum(p_children * r.extra_child_price)             as net_extra_children,
      max(r.min_stay)                                   as strictest_min_stay,
      min(coalesce(r.max_stay, 9999))                   as strictest_max_stay,
      min(a.allotment - a.sold)                         as rooms_available,
      bool_or(a.stop_sell)                              as any_stop_sell,
      max(coalesce(a.min_stay, 1))                      as allocation_min_stay
    from candidate c
    cross join nights n
    join public.rates r
      on r.rate_plan_id = c.rate_plan_id
     and r.room_type_id = c.room_type_id
     and r.stay_period @> n.stay_date
     and not r.is_closed
    join public.allocations a
      on a.room_type_id = c.room_type_id
     and a.stay_date = n.stay_date
    group by
      c.hotel_id, c.hotel_code, c.name_ar, c.name_en, c.city_ar, c.city_en,
      c.country_code, c.star_rating, c.property_type, c.room_type_id, c.room_code,
      c.room_name_ar, c.room_name_en, c.max_occupancy, c.standard_occupancy,
      c.rate_plan_id, c.plan_name_ar, c.plan_name_en, c.meal_plan_key,
      c.currency_code, c.cancellation_policy_id
  ),
  sellable as (
    select
      p.*,
      (p.net_room_total + p.net_extra_adults + p.net_extra_children) as net_total
    from priced p
    where p.nights_covered = v_nights
      and not p.any_stop_sell
      and p.rooms_available >= p_rooms
      and v_nights >= greatest(p.strictest_min_stay, p.allocation_min_stay)
      and v_nights <= p.strictest_max_stay
  )
  select
    s.hotel_id, s.hotel_code, s.name_ar, s.name_en, s.city_ar, s.city_en,
    s.country_code, s.star_rating, s.property_type,
    (select hi.secure_url from public.hotel_images hi
      where hi.hotel_id = s.hotel_id and hi.is_cover and hi.room_type_id is null
      limit 1) as cover_url,
    s.room_type_id, s.room_code, s.room_name_ar, s.room_name_en, s.max_occupancy,
    s.rate_plan_id, s.plan_name_ar, s.plan_name_en, s.meal_plan_key, s.currency_code,
    v_nights as nights,
    round(
      case m.markup_type
        when 'percentage' then s.net_total * (1 + m.markup_value / 100)
        else s.net_total + m.markup_value
      end, 2
    ) as sell_total,
    round(
      case m.markup_type
        when 'percentage' then s.net_total * (1 + m.markup_value / 100)
        else s.net_total + m.markup_value
      end / v_nights, 2
    ) as sell_per_night,
    s.rooms_available::integer,
    coalesce(not cp.is_non_refundable, true) as is_refundable
  from sellable s
  left join lateral public.resolve_markup(p_agency_id, s.hotel_id) m on true
  left join public.cancellation_policies cp on cp.id = s.cancellation_policy_id
  order by sell_total asc, s.name_en asc;
end;
$$;

revoke all on function public.search_availability_for(uuid, date, date, integer, integer, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.search_availability_for(uuid, date, date, integer, integer, integer, text, text, text)
  to service_role;

comment on function public.search_availability_for(uuid, date, date, integer, integer, integer, text, text, text) is
  'Availability search priced for an explicit agency. SERVICE ROLE ONLY. sell_total and sell_per_night are PER ROOM — p_rooms only filters on availability.';

-- The portal entry point keeps its signature, grants and behaviour; it now
-- names the caller's agency and delegates, so the two cannot drift apart.
create or replace function public.search_availability(
  p_check_in    date,
  p_check_out   date,
  p_adults      integer default 2,
  p_children    integer default 0,
  p_rooms       integer default 1,
  p_country     text default null,
  p_city        text default null,
  p_query       text default null
)
returns table (
  hotel_id          uuid,
  hotel_code        text,
  name_ar           text,
  name_en           text,
  city_ar           text,
  city_en           text,
  country_code      char(2),
  star_rating       smallint,
  property_type     public.property_type,
  cover_url         text,
  room_type_id      uuid,
  room_code         text,
  room_name_ar      text,
  room_name_en      text,
  max_occupancy     smallint,
  rate_plan_id      uuid,
  plan_name_ar      text,
  plan_name_en      text,
  meal_plan_key     text,
  currency_code     char(3),
  nights            integer,
  sell_total        numeric,
  sell_per_night    numeric,
  rooms_available   integer,
  is_refundable     boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_user() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select * from public.search_availability_for(
    public.current_agency_id(),
    p_check_in, p_check_out, p_adults, p_children, p_rooms, p_country, p_city, p_query
  );
end;
$$;

comment on function public.search_availability(date, date, integer, integer, integer, text, text, text) is
  'Availability search for the signed-in caller''s agency. sell_total and sell_per_night are PER ROOM — p_rooms only filters on availability. A caller booking N rooms must multiply.';

-- ----------------------------------------------------------------------------
-- 3. The hotel booking, for an explicit agency
--
-- The body is `create_booking()` from 20260908170000, with three changes:
--   - the agency and the acting user are parameters;
--   - credit is measured against the BALANCE (`agency_balance`, which nets off
--     recorded payments) rather than gross bookings. §15 (11.2) decided this
--     in Phase 5b, but the hotel booking kept calling `agency_outstanding`, so
--     an agency that paid its whole account was still refused as if it had
--     paid nothing. Packages (8c) already used the balance;
--   - the client reference is stored, and a duplicate is refused by name.
-- ----------------------------------------------------------------------------

create or replace function public.create_hotel_booking_for(
  p_agency_id        uuid,
  p_actor_id         uuid,
  p_room_type_id     uuid,
  p_rate_plan_id     uuid,
  p_check_in         date,
  p_check_out        date,
  p_adults           integer,
  p_children         integer,
  p_rooms            integer,
  p_guest_name       text,
  p_guest_email      text,
  p_guest_phone      text,
  p_requests         text,
  p_quotation_id     uuid,
  p_promo_code       text,
  p_client_reference text,
  p_api_key_id       uuid
)
returns table (booking_id uuid, reference text, total_sell numeric, currency_code char(3))
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
  v_balance     numeric;
  v_room_total  numeric;
  v_subtotal    numeric;
  v_discount    numeric := 0;
  v_tax_amount  numeric := 0;
  v_tax_percent numeric := 0;
  v_total       numeric;
  v_net         numeric;
  v_promo_code  text := null;
  v_promo_id    uuid := null;
  v_client_ref  text := nullif(btrim(coalesce(p_client_reference, '')), '');
  v_reference   text;
  v_booking_id  uuid;
  v_night       date;
begin
  select a.credit_limit, a.name, a.code, a.status
    into v_agency
  from public.agencies a
  where a.id = p_agency_id;

  if not found or v_agency.status <> 'active' then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if v_nights < 1 or v_nights > 30 then
    raise exception 'A stay must be between 1 and 30 nights.' using errcode = '22023';
  end if;

  -- Checked before anything is held, so a retry is refused cleanly rather
  -- than failing on the unique index after inventory has moved.
  if v_client_ref is not null and exists (
    select 1 from public.bookings b
    where b.agency_id = p_agency_id and b.client_reference = v_client_ref
  ) then
    raise exception 'A booking with this client reference already exists.'
      using errcode = '23505';
  end if;

  -- 1. Re-derive the offer (§15, 7.3 — one source of truth for pricing).
  select *
    into v_offer
  from public.search_availability_for(p_agency_id, p_check_in, p_check_out, p_adults, p_children, p_rooms)
  where room_type_id = p_room_type_id
    and rate_plan_id = p_rate_plan_id
  limit 1;

  if v_offer is null then
    raise exception 'That offer is no longer available.' using errcode = 'P0002';
  end if;

  -- `v_offer.sell_total` is the price of ONE room for the whole stay.
  v_room_total := v_offer.sell_total;
  v_subtotal   := v_room_total * p_rooms;

  -- 2. Discount, against what is actually being charged.
  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    select * into v_promo
    from public.evaluate_promo_code(p_promo_code, p_agency_id, v_subtotal, p_check_in);

    if v_promo.reason <> 'ok' then
      raise exception 'Promotion code cannot be used: %', v_promo.reason using errcode = 'P0004';
    end if;

    v_discount   := v_promo.discount;
    v_promo_code := v_promo.code;
    v_promo_id   := v_promo.promo_id;
  end if;

  -- 3. Tax, from the configured default.
  select t.percent into v_tax_percent
  from public.tax_rates t
  where t.is_default and t.is_active
  limit 1;

  v_tax_percent := coalesce(v_tax_percent, 0);
  v_tax_amount  := round((v_subtotal - v_discount) * v_tax_percent / 100, 2);
  v_total       := v_subtotal - v_discount + v_tax_amount;

  -- 4. Credit, against what the agency owes after its payments (§15, 11.2).
  v_balance := public.agency_balance(p_agency_id);

  if v_balance + v_total > coalesce(v_agency.credit_limit, 0) then
    raise exception 'This booking would exceed the agency credit limit.'
      using errcode = 'P0003',
            detail = format('balance=%s booking=%s limit=%s',
                            v_balance, v_total, coalesce(v_agency.credit_limit, 0));
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
    subtotal_sell, discount_amount, promo_code, tax_rate_percent, tax_amount, total_sell,
    client_reference
  ) values (
    v_reference, p_agency_id, v_agency.name, v_agency.code, p_actor_id, p_quotation_id, 'pending',
    p_check_in, p_check_out, v_nights,
    p_guest_name, p_guest_email, p_guest_phone, p_requests,
    p_adults, p_children, p_rooms, v_offer.currency_code,
    v_subtotal, v_discount, v_promo_code, v_tax_percent, v_tax_amount, v_total,
    v_client_ref
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
    values (v_promo_id, v_booking_id, p_agency_id, v_discount);
  end if;

  -- An API booking has no user, so the audit row names the key instead —
  -- otherwise "who made this booking?" would have no answer at all.
  perform public.write_audit('create', 'bookings', v_booking_id::text,
                             jsonb_strip_nulls(jsonb_build_object(
                               'reference', v_reference,
                               'total', v_total,
                               'rooms', p_rooms,
                               'channel', case when p_api_key_id is null then 'portal' else 'api' end,
                               'api_key_id', p_api_key_id,
                               'agency_id', p_agency_id,
                               'client_reference', v_client_ref)));

  return query select v_booking_id, v_reference, v_total, v_offer.currency_code;
end;
$$;

revoke all on function public.create_hotel_booking_for(uuid, uuid, uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

comment on function public.create_hotel_booking_for(uuid, uuid, uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text, text, uuid) is
  'The one hotel booking implementation. Callable only from create_booking (portal) and create_b2b_api_booking (API), each of which establishes the agency itself.';

-- The portal entry point: same signature and grants as before.
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
begin
  if not public.is_active_user() or public.current_agency_id() is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select * from public.create_hotel_booking_for(
    public.current_agency_id(), auth.uid(),
    p_room_type_id, p_rate_plan_id, p_check_in, p_check_out,
    p_adults, p_children, p_rooms,
    p_guest_name, p_guest_email, p_guest_phone, p_requests,
    p_quotation_id, p_promo_code,
    null, null
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. The API entry point
--
-- Takes the KEY, not an agency id. The agency is resolved from the key inside
-- the database, so no caller — not even a bug in the route handler — can
-- name a different agency to charge. Service role only.
-- ----------------------------------------------------------------------------

drop function if exists public.create_b2b_api_booking(
  uuid, uuid, uuid, date, date, integer, integer, integer, text, text, text, text, text, text
);

create function public.create_b2b_api_booking(
  p_api_key_id        uuid,
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
returns table (booking_id uuid, reference text, total_sell numeric, currency_code char(3), status text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_id uuid;
begin
  select k.agency_id
    into v_agency_id
  from public.agency_api_keys k
  where k.id = p_api_key_id
    and k.is_active
    and (k.expires_at is null or k.expires_at > now());

  if v_agency_id is null then
    raise exception 'API key is not valid.' using errcode = '42501';
  end if;

  return query
  select c.booking_id, c.reference, c.total_sell, c.currency_code, 'pending'::text
  from public.create_hotel_booking_for(
    v_agency_id, null,
    p_room_type_id, p_rate_plan_id, p_check_in, p_check_out,
    p_adults, p_children, p_rooms,
    p_guest_name, p_guest_email, p_guest_phone, p_requests,
    null, p_promo_code,
    p_client_reference, p_api_key_id
  ) c;
end;
$$;

revoke all on function public.create_b2b_api_booking(uuid, uuid, uuid, date, date, integer, integer, integer, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_b2b_api_booking(uuid, uuid, uuid, date, date, integer, integer, integer, text, text, text, text, text, text)
  to service_role;

-- Only the API route resolves keys. A signed-in user has no reason to call it.
revoke execute on function public.authenticate_b2b_api_key(text) from authenticated;

-- ----------------------------------------------------------------------------
-- 5. API keys: read-only through PostgREST
--
-- Every write goes through a server action that checks the permission and
-- writes the audit row (§15, 10.5 — the same shape as bookings). The read
-- policy calls only functions `authenticated` can execute.
-- ----------------------------------------------------------------------------

drop policy if exists agency_api_keys_select on public.agency_api_keys;
drop policy if exists agency_api_keys_insert on public.agency_api_keys;
drop policy if exists agency_api_keys_update on public.agency_api_keys;
drop policy if exists agency_api_keys_delete on public.agency_api_keys;

create policy agency_api_keys_read
  on public.agency_api_keys for select
  to authenticated
  using (
    (agency_id = public.current_agency_id() and public.is_active_user())
    or public.authorize('agencies.view')
  );

-- ----------------------------------------------------------------------------
-- 6. Supplier resolution: an agent may only ask about their own agency
--
-- The previous version honoured any `p_agency_id`, so an agent could read
-- another agency's supplier preferences.
-- ----------------------------------------------------------------------------

create or replace function public.enabled_supplier_keys_for_agency(p_agency_id uuid default null)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select case
      -- System context (the API route, a migration): the caller names the agency.
      when auth.uid() is null then p_agency_id
      when public.authorize('agencies.view') then coalesce(p_agency_id, public.current_agency_id())
      else public.current_agency_id()
    end as agency_id
  )
  select si.provider_key
  from public.supplier_integrations si
  cross join target t
  left join public.agency_supplier_preferences asp
    on asp.supplier_key = si.provider_key
   and asp.agency_id = t.agency_id
  where si.is_enabled
    and coalesce(asp.is_enabled, true)
    and (auth.uid() is null or public.is_active_user())
  order by si.priority, si.provider_key;
$$;

-- Which supplier holds a property is commercial information the agent-facing
-- side deliberately hides (§15, 9.4). The dedup engine reads it server-side.
drop policy if exists hotel_supplier_mappings_select on public.hotel_supplier_mappings;

create policy hotel_supplier_mappings_select
  on public.hotel_supplier_mappings for select
  to authenticated
  using (public.authorize('hotels.view') or public.authorize('settings.suppliers.manage'));

-- ----------------------------------------------------------------------------
-- 7. Suppliers with no real integration cannot stay enabled
--
-- The six Phase 9 "adapters" generated invented hotels and prices and reported
-- a successful connection without contacting anything. They are removed from
-- the code in the same change; a row left enabled would now only produce a
-- failure on every search. Disabling is reversible, and the credentials an
-- admin stored stay in Vault for when a real adapter is written.
-- ----------------------------------------------------------------------------

update public.supplier_integrations
   set is_enabled = false
 where provider_key in ('hotelbeds', 'webbeds', 'tbo', 'itrip', 'within_earth', 'ratehawk')
   and is_enabled;
