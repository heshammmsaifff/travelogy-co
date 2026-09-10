-- ============================================================================
-- Phase 8a — the transfers module
--
-- THE ARCHITECTURAL DECISION, taken here because it shapes every product module
-- that follows: a transfer booking is a row in `bookings`, not a row in a
-- second booking table.
--
-- The financial spine — credit limit, `agency_outstanding()`, the statement,
-- receivables, and all three Phase 7 reports — is built on `bookings`. A
-- separate `transfer_bookings` table would turn every one of those into a
-- UNION, and the packages module would add a third arm to each. One spine means
-- money is counted in exactly one place, which is the property §10 actually
-- cares about.
--
-- The cost is that `bookings` was hotel-shaped: `nights between 1 and 30`,
-- `check_out > check_in`, `nights = check_out - check_in`. A transfer happens on
-- a single day. Those three constraints are replaced with product-aware
-- versions rather than dropped — a hotel booking still cannot have zero nights.
-- ============================================================================

create type public.product_type as enum ('hotel', 'transfer');

alter table public.bookings
  add column product_type public.product_type not null default 'hotel';

comment on column public.bookings.product_type is
  'Which product this booking is for. The money columns mean the same thing for all of them; the date columns are interpreted per product.';

-- Hotel: check_out is the departure morning, nights is the gap.
-- Transfer: a single day, so check_out = check_in and nights = 0.
alter table public.bookings drop constraint bookings_dates_ordered;
alter table public.bookings drop constraint bookings_nights_match;
alter table public.bookings drop constraint bookings_nights_check;

alter table public.bookings
  add constraint bookings_dates_by_product check (
    case product_type
      when 'hotel' then check_out > check_in and nights = check_out - check_in
                        and nights between 1 and 30
      when 'transfer' then check_out = check_in and nights = 0
    end
  );

-- `rooms` is "how many of the thing" — rooms for a hotel, vehicles for a
-- transfer. Reusing the column beats a nullable `vehicles` column that is
-- meaningless for half the rows.
comment on column public.bookings.rooms is
  'How many units: rooms for a hotel booking, vehicles for a transfer.';

-- ----------------------------------------------------------------------------
-- 1. Permissions
-- ----------------------------------------------------------------------------

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values
  ('transfers.view', 'transfers', 'عرض خدمات النقل', 'View transfers',
   'الاطلاع على المركبات والمسارات وأسعار النقل.', 'See vehicles, routes and transfer rates.'),
  ('transfers.manage', 'transfers', 'إدارة خدمات النقل', 'Manage transfers',
   'إضافة وتعديل المركبات والمسارات والأسعار.', 'Add and edit vehicles, routes and rates.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Inventory
-- ----------------------------------------------------------------------------

create type public.transfer_direction as enum ('arrival', 'departure', 'point_to_point');

create table public.vehicle_types (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z][A-Z0-9_]{1,20}$'),
  name_ar       text not null,
  name_en       text not null,

  -- What the agent needs to choose correctly: how many people and bags fit.
  max_passengers smallint not null check (max_passengers between 1 and 60),
  max_luggage    smallint not null default 0 check (max_luggage >= 0),

  description_ar text,
  description_en text,
  image_public_id text,

  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger vehicle_types_set_updated_at
  before update on public.vehicle_types
  for each row execute function public.set_updated_at();

create table public.transfer_routes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z][A-Z0-9_-]{1,30}$'),

  country_code  char(2) not null,
  city_ar       text not null,
  city_en       text not null,

  from_name_ar  text not null,
  from_name_en  text not null,
  to_name_ar    text not null,
  to_name_en    text not null,

  direction     public.transfer_direction not null default 'point_to_point',
  -- Shown to the agent so they can judge a pickup time. Not used in pricing.
  duration_minutes smallint check (duration_minutes is null or duration_minutes between 1 and 1440),
  distance_km   smallint check (distance_km is null or distance_km >= 0),

  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.transfer_routes is
  'A named journey. Direction distinguishes an airport arrival from a departure, because the two need different information from the agent (flight in vs flight out).';

create index transfer_routes_lookup_idx on public.transfer_routes (country_code, city_en) where is_active;

create trigger transfer_routes_set_updated_at
  before update on public.transfer_routes
  for each row execute function public.set_updated_at();

create table public.transfer_rates (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid not null references public.transfer_routes (id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_types (id) on delete cascade,

  -- Contracted cost for ONE vehicle on this route. Net, never shown to agents
  -- (§15, 6.1) — the same rule the hotel rates follow.
  price_per_vehicle numeric(14, 2) not null check (price_per_vehicle >= 0),
  currency_code   char(3) not null default 'EGP',

  -- Half-open, exactly as hotel rate periods are (§15, 6.3): the admin enters
  -- the first and last day, the database stores [from, to+1).
  valid_period    daterange not null,

  is_closed       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Two rates covering the same day for the same route and vehicle are
  -- impossible. An overlap is not a display bug, it is a transfer charged the
  -- wrong amount decided by whichever row a query returned first (§15, 6.2).
  constraint transfer_rates_no_overlap
    exclude using gist (route_id with =, vehicle_type_id with =, valid_period with &&)
);

create index transfer_rates_lookup_idx on public.transfer_rates (route_id, vehicle_type_id);

create trigger transfer_rates_set_updated_at
  before update on public.transfer_rates
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. The booking item
-- ----------------------------------------------------------------------------

create table public.transfer_items (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,

  route_id        uuid references public.transfer_routes (id) on delete set null,
  vehicle_type_id uuid references public.vehicle_types (id) on delete set null,

  -- Snapshot, for the same reason every other item in this system is one: a
  -- voucher issued today must still read correctly after a route is renamed.
  route_code      text not null,
  from_name_ar    text not null,
  from_name_en    text not null,
  to_name_ar      text not null,
  to_name_en      text not null,
  city_ar         text,
  city_en         text,
  direction       public.transfer_direction not null,
  vehicle_name_ar text not null,
  vehicle_name_en text not null,
  max_passengers  smallint not null,

  -- What the driver needs on the day.
  transfer_date   date not null,
  pickup_time     time,
  flight_number   text,
  pickup_notes    text check (pickup_notes is null or length(pickup_notes) <= 500),

  passengers      smallint not null check (passengers between 1 and 60),
  vehicles        smallint not null default 1 check (vehicles between 1 and 20),

  currency_code   char(3) not null,
  sell_per_vehicle numeric(14, 2) not null check (sell_per_vehicle >= 0),
  sell_total      numeric(14, 2) not null check (sell_total >= 0),

  created_at      timestamptz not null default now()
);

create index transfer_items_booking_idx on public.transfer_items (booking_id);
create index transfer_items_date_idx on public.transfer_items (transfer_date);

-- ----------------------------------------------------------------------------
-- 4. RLS
--
-- Agents get NO direct read on transfer_rates, exactly as they get none on
-- hotel rates (§15, 6.1): the gap between the contracted price and the agent's
-- quote is the client's margin. They reach availability through
-- search_transfers(), which returns sell prices only.
-- ----------------------------------------------------------------------------

alter table public.vehicle_types    enable row level security;
alter table public.transfer_routes  enable row level security;
alter table public.transfer_rates   enable row level security;
alter table public.transfer_items   enable row level security;

-- Vehicles and routes are descriptive, not commercial — an agent needs to see
-- what a "Minivan" is to choose one, and search returns those names anyway.
create policy vehicle_types_read
  on public.vehicle_types for select
  to authenticated
  using (public.is_active_user());

create policy transfer_routes_read
  on public.transfer_routes for select
  to authenticated
  using (public.is_active_user());

create policy vehicle_types_write
  on public.vehicle_types for all
  to authenticated
  using (public.authorize('transfers.manage'))
  with check (public.authorize('transfers.manage'));

create policy transfer_routes_write
  on public.transfer_routes for all
  to authenticated
  using (public.authorize('transfers.manage'))
  with check (public.authorize('transfers.manage'));

-- Rates: management only. No agent-facing SELECT policy at all.
create policy transfer_rates_manage
  on public.transfer_rates for all
  to authenticated
  using (public.authorize('transfers.manage'))
  with check (public.authorize('transfers.manage'));

create policy transfer_items_read
  on public.transfer_items for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and ((b.agency_id = public.current_agency_id() and public.is_active_user())
             or public.authorize('bookings.view_all'))
    )
  );

-- No write policy: create_transfer_booking() writes it, as the owner.

-- ----------------------------------------------------------------------------
-- 5. Search
--
-- Same shape as search_availability(): all the work in Postgres, SELL prices
-- only, the net never leaving the function (§15, 7.3).
--
-- ONE DELIBERATE DIFFERENCE, stated rather than hidden: transfers have no
-- per-day allocation. A hotel releases a fixed number of rooms; a transfer
-- operator sends another car. So availability here means "a rate covers this
-- date and is not closed", and there is no oversell check. If the client ever
-- contracts a fixed fleet, that becomes an allocation table like the hotels'.
-- ----------------------------------------------------------------------------

create or replace function public.search_transfers(
  p_date       date,
  p_passengers integer default 2,
  p_country    text default null,
  p_city       text default null,
  p_query      text default null
)
returns table (
  route_id         uuid,
  route_code       text,
  from_name_ar     text,
  from_name_en     text,
  to_name_ar       text,
  to_name_en       text,
  city_ar          text,
  city_en          text,
  country_code     char(2),
  direction        public.transfer_direction,
  duration_minutes smallint,
  vehicle_type_id  uuid,
  vehicle_name_ar  text,
  vehicle_name_en  text,
  max_passengers   smallint,
  max_luggage      smallint,
  vehicle_image    text,
  currency_code    char(3),
  -- Sell price for ONE vehicle. A booking for N vehicles multiplies — the same
  -- unit rule as hotel rooms, and the same one that went wrong in Phase 7.
  sell_per_vehicle numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_id uuid := public.current_agency_id();
begin
  -- SECURITY DEFINER bypasses RLS, so this stands in for it (§12).
  if not public.is_active_user() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  with priced as (
    select r.id as r_id, r.code as r_code,
           r.from_name_ar, r.from_name_en, r.to_name_ar, r.to_name_en,
           r.city_ar, r.city_en, r.country_code, r.direction, r.duration_minutes,
           v.id as v_id, v.name_ar as v_name_ar, v.name_en as v_name_en,
           v.max_passengers, v.max_luggage, v.image_public_id,
           tr.currency_code as ccy,
           tr.price_per_vehicle as net
    from public.transfer_routes r
    join public.transfer_rates tr on tr.route_id = r.id
                                 and tr.valid_period @> p_date
                                 and not tr.is_closed
    join public.vehicle_types v on v.id = tr.vehicle_type_id and v.is_active
    where r.is_active
      and v.max_passengers >= p_passengers
      and (p_country is null or r.country_code = upper(p_country))
      and (p_city is null or r.city_en ilike p_city or r.city_ar ilike p_city)
      and (
        p_query is null
        or r.from_name_en ilike '%' || p_query || '%'
        or r.from_name_ar ilike '%' || p_query || '%'
        or r.to_name_en   ilike '%' || p_query || '%'
        or r.to_name_ar   ilike '%' || p_query || '%'
        or r.city_en      ilike '%' || p_query || '%'
        or r.city_ar      ilike '%' || p_query || '%'
      )
  ),
  marked as (
    select p.*,
           -- Transfers have no route-level markup scope, so this resolves
           -- agency-then-global. Passing NULL for the hotel makes the two
           -- hotel-scoped rules unmatchable, which is the intended fallback.
           (select m.markup_type from public.resolve_markup(v_agency_id, null) m) as m_type,
           (select m.markup_value from public.resolve_markup(v_agency_id, null) m) as m_value
    from priced p
  )
  select m.r_id, m.r_code,
         m.from_name_ar, m.from_name_en, m.to_name_ar, m.to_name_en,
         m.city_ar, m.city_en, m.country_code, m.direction, m.duration_minutes,
         m.v_id, m.v_name_ar, m.v_name_en, m.max_passengers, m.max_luggage, m.image_public_id,
         m.ccy,
         round(
           case m.m_type
             when 'percentage' then m.net * (1 + coalesce(m.m_value, 0) / 100)
             when 'fixed'      then m.net + coalesce(m.m_value, 0)
             else m.net
           end,
         2)
  from marked m
  order by 20 asc, m.v_name_en;
end;
$$;

revoke all on function public.search_transfers(date, integer, text, text, text) from public, anon;
grant execute on function public.search_transfers(date, integer, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. The net for one transfer offer — never callable by an agent
-- ----------------------------------------------------------------------------

create or replace function public.transfer_net_total(
  p_route_id        uuid,
  p_vehicle_type_id uuid,
  p_date            date,
  p_vehicles        integer default 1
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(tr.price_per_vehicle * p_vehicles, 0)
  from public.transfer_rates tr
  where tr.route_id = p_route_id
    and tr.vehicle_type_id = p_vehicle_type_id
    and tr.valid_period @> p_date
    and not tr.is_closed
  limit 1;
$$;

revoke all on function public.transfer_net_total(uuid, uuid, date, integer)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Booking a transfer
--
-- Mirrors create_booking()'s guarantees: the price is re-derived server-side,
-- credit is checked before the row exists, the cost is captured in the table
-- agents cannot read, and every unit is multiplied by the quantity — the bug
-- Phase 7 found in the hotel path is not repeated here.
-- ----------------------------------------------------------------------------

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
  v_outstanding numeric;
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

  -- 4. Credit.
  select a.credit_limit, a.name, a.code into v_agency
  from public.agencies a where a.id = v_agency_id;

  v_outstanding := public.agency_outstanding(v_agency_id);

  if v_outstanding + v_total > coalesce(v_agency.credit_limit, 0) then
    raise exception 'This booking would exceed the agency credit limit.'
      using errcode = 'P0003',
            detail = format('outstanding=%s booking=%s limit=%s',
                            v_outstanding, v_total, coalesce(v_agency.credit_limit, 0));
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
