-- ============================================================================
-- Phase 3c — markup rules and the agent-facing availability search
--
-- Agents never read `rates`: those are contracted net prices and the gap to
-- the quoted price is the client's margin (§15, decision 6.1). Everything an
-- agent sees comes out of search_availability() below, which resolves the
-- applicable markup and returns SELL prices only. The net figure never leaves
-- this function.
-- ============================================================================

create type public.markup_scope as enum ('global', 'agency', 'hotel', 'agency_hotel');

-- ---------------------------------------------------------------- markup

create table public.markup_rules (
  id            uuid primary key default gen_random_uuid(),

  scope         public.markup_scope not null,
  agency_id     uuid references public.agencies (id) on delete cascade,
  hotel_id      uuid references public.hotels (id) on delete cascade,

  markup_type   public.charge_type not null default 'percentage',
  markup_value  numeric(12, 2) not null check (markup_value >= 0),

  is_active     boolean not null default true,
  note          text,

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The scope column and the foreign keys have to agree, or resolution order
  -- becomes guesswork.
  constraint markup_rules_scope_coherent check (
    (scope = 'global'       and agency_id is null and hotel_id is null) or
    (scope = 'agency'       and agency_id is not null and hotel_id is null) or
    (scope = 'hotel'        and agency_id is null and hotel_id is not null) or
    (scope = 'agency_hotel' and agency_id is not null and hotel_id is not null)
  ),

  constraint markup_rules_percentage_range
    check (markup_type <> 'percentage' or markup_value <= 100),

  -- `nights` makes no sense as a markup.
  constraint markup_rules_type_supported
    check (markup_type in ('percentage', 'fixed'))
);

-- One active rule per exact scope combination, so resolution is deterministic.
create unique index markup_rules_unique_global
  on public.markup_rules ((true)) where scope = 'global' and is_active;
create unique index markup_rules_unique_agency
  on public.markup_rules (agency_id) where scope = 'agency' and is_active;
create unique index markup_rules_unique_hotel
  on public.markup_rules (hotel_id) where scope = 'hotel' and is_active;
create unique index markup_rules_unique_agency_hotel
  on public.markup_rules (agency_id, hotel_id) where scope = 'agency_hotel' and is_active;

create trigger markup_rules_set_updated_at
  before update on public.markup_rules
  for each row execute function public.set_updated_at();

alter table public.markup_rules enable row level security;

comment on table public.markup_rules is
  'Margin applied to net contract rates. Resolution is most-specific-first: agency+hotel, then hotel, then agency, then global.';

insert into public.permissions (key, module, name_ar, name_en, sort_order)
values ('settings.markup.manage', 'settings', 'إدارة هوامش الربح', 'Manage markup rules', 30)
on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en;

create policy markup_rules_select
  on public.markup_rules for select to authenticated
  using (public.authorize('settings.markup.manage'));

create policy markup_rules_write
  on public.markup_rules for all to authenticated
  using (public.authorize('settings.markup.manage'))
  with check (public.authorize('settings.markup.manage'));

-- A default so a freshly installed system quotes something sane rather than
-- selling at cost. The client changes it from the back-office.
insert into public.markup_rules (scope, markup_type, markup_value, note)
values ('global', 'percentage', 15, 'Default markup, seeded at install. Adjust in Settings.')
on conflict do nothing;

/**
 * Resolves the markup for one agency + hotel pair, most specific first.
 *
 * Returned rather than applied so the caller can show the agent a single
 * consistent price and, separately, let the back-office see which rule fired.
 */
create or replace function public.resolve_markup(p_agency_id uuid, p_hotel_id uuid)
returns table (markup_type public.charge_type, markup_value numeric, scope public.markup_scope)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.markup_type, m.markup_value, m.scope
  from public.markup_rules m
  where m.is_active
    and (
      (m.scope = 'agency_hotel' and m.agency_id = p_agency_id and m.hotel_id = p_hotel_id) or
      (m.scope = 'hotel'        and m.hotel_id  = p_hotel_id) or
      (m.scope = 'agency'       and m.agency_id = p_agency_id) or
      (m.scope = 'global')
    )
  order by case m.scope
    when 'agency_hotel' then 1
    when 'hotel'        then 2
    when 'agency'       then 3
    else 4
  end
  limit 1;
$$;

-- ============================================================================
-- Availability search
--
-- Runs entirely in Postgres (CLAUDE.md §11): joining rates, allocation and
-- room types in SQL and returning only what the agent may see. Doing this in
-- JavaScript would mean shipping net rates to the server-side caller and
-- filtering there, which is both slower and one refactor away from leaking.
--
-- A room is offered only if EVERY night of the stay has:
--   - a rate row in an active plan, not closed
--   - allocation with remaining rooms and no stop-sell
-- and the stay satisfies the strictest min/max stay across those nights.
-- ============================================================================

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
  -- Sell price only. The net total stays inside this function.
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
  v_agency_id  uuid    := public.current_agency_id();
  v_guests     integer := p_adults + p_children;
begin
  -- The caller must be an active account. SECURITY DEFINER bypasses RLS, so
  -- this check is what stands in for it (§12).
  if not public.is_active_user() then
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
    -- One row per night of the stay; the departure date is not a night.
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
      -- Every night must price and be available, so the counts below are what
      -- decides whether this room is offered at all.
      count(n.stay_date)                                as nights_covered,
      sum(r.price_per_night)                            as net_room_total,
      -- Guests beyond what the rate covers are charged per night.
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
    where p.nights_covered = v_nights          -- every night priced and allocated
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
    -- Markup applied here, once, so the agent and any later quote agree.
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
  left join lateral public.resolve_markup(v_agency_id, s.hotel_id) m on true
  left join public.cancellation_policies cp on cp.id = s.cancellation_policy_id
  order by sell_total asc, s.name_en asc;
end;
$$;

revoke all on function public.search_availability(date, date, integer, integer, integer, text, text, text)
  from public, anon;
grant execute on function public.search_availability(date, date, integer, integer, integer, text, text, text)
  to authenticated;

revoke all on function public.resolve_markup(uuid, uuid) from public, anon, authenticated;
