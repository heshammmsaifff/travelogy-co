-- ============================================================================
-- Phase 7 — capturing what a booking COST us, without letting agents see it
--
-- A profitability report needs margin = sell − net. Nothing in the schema knows
-- the net: §15 (6.1, 7.3) deliberately keeps contracted rates away from agents,
-- and `search_availability()` returns sell prices only, on purpose.
--
-- THE DESIGN QUESTION was where to put the cost. The obvious answer — a
-- `net_cost` column on `bookings` — is wrong, and wrong for a reason this
-- project has already been bitten by: **RLS grants rows, not columns** (§15,
-- Phase 1, the self-serve credit bug). `bookings_read` lets an agent read their
-- own booking row, so a net column on it would hand every agent the client's
-- margin on every booking they make. No amount of care in the application would
-- put that back — PostgREST is a real endpoint and agents hold real tokens.
--
-- So the cost lives in its own table with its own policy. The boundary is then
-- structural: an agent cannot reach it by selecting a column, and a later phase
-- adding a field to a booking query cannot leak it by accident.
-- ============================================================================

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values
  ('reports.view', 'reports', 'عرض التقارير', 'View reports',
   'الاطلاع على تقارير الحجوزات والوكلاء والفنادق، بما فيها هامش الربح.',
   'See booking, agency and hotel reports, including margin.'),
  ('reports.export', 'reports', 'تصدير التقارير', 'Export reports',
   'تنزيل التقارير كملف CSV.', 'Download reports as CSV.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 1. The net for one offer
--
-- This mirrors the `priced` CTE inside `search_availability()`. Duplicating
-- arithmetic is exactly what §15 (7.3) warns against, so two things guard it:
-- the mirror is as small as possible, and the Phase 7 verification suite
-- asserts the invariant `net + markup = sell` against a real booking. If the
-- two ever drift, that test fails rather than the margin quietly going wrong.
-- ----------------------------------------------------------------------------

create or replace function public.offer_net_total(
  p_room_type_id uuid,
  p_rate_plan_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_adults       integer,
  p_children     integer,
  p_rooms        integer default 1
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with nights as (
    select generate_series(p_check_in, p_check_out - 1, interval '1 day')::date as stay_date
  )
  select coalesce(
    sum(
      r.price_per_night
      + greatest(p_adults - rt.standard_occupancy, 0) * r.extra_adult_price
      + p_children * r.extra_child_price
    ) * p_rooms,
    0
  )
  from nights n
  join public.rates r
    on r.rate_plan_id = p_rate_plan_id
   and r.room_type_id = p_room_type_id
   and r.stay_period @> n.stay_date
   and not r.is_closed
  join public.room_types rt on rt.id = p_room_type_id;
$$;

comment on function public.offer_net_total is
  'Contracted cost of one offer. Mirrors search_availability()''s net calculation; never exposed to an agent.';

-- Not callable by anyone holding a user token. It is used by create_booking,
-- which is SECURITY DEFINER and therefore runs as the owner.
revoke all on function public.offer_net_total(uuid, uuid, date, date, integer, integer, integer)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. The cost table
-- ----------------------------------------------------------------------------

create table public.booking_costs (
  booking_id   uuid primary key references public.bookings (id) on delete cascade,

  -- What we owe the supplier. Never what the agent owes us.
  net_total    numeric(14, 2) not null check (net_total >= 0),
  currency_code char(3) not null,

  -- Copied here so a margin can be computed without joining a table the reader
  -- may not be entitled to read either.
  sell_total   numeric(14, 2) not null check (sell_total >= 0),

  captured_at  timestamptz not null default now()
);

comment on table public.booking_costs is
  'Cost side of a booking, kept OUT of `bookings` because RLS grants rows and an agent can read their own booking row (§15, Phase 7).';

create index booking_costs_captured_idx on public.booking_costs (captured_at desc);

alter table public.booking_costs enable row level security;

-- The whole point of the separate table: only a reports reader gets in.
create policy booking_costs_read
  on public.booking_costs for select
  to authenticated
  using (public.authorize('reports.view'));

-- No INSERT/UPDATE/DELETE policy at all. `create_booking` writes it, and it
-- runs as the owner.

-- ----------------------------------------------------------------------------
-- 3. create_booking records the cost
--
-- Repeated in full because `create or replace function` has no partial form,
-- and a booking function that drifted from its migration would be worse than
-- the duplication.
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

  v_subtotal := v_offer.sell_total;

  -- 2. Discount. An unusable code is REFUSED rather than quietly ignored.
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
                             jsonb_build_object('reference', v_reference, 'total', v_total));

  return query select v_booking_id, v_reference, v_total, v_offer.currency_code;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text) to authenticated;
