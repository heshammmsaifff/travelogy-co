-- ============================================================================
-- Phase 8c — searching, pricing and booking a package
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Search
--
-- Same shape as `search_availability` and `search_transfers`: all the work in
-- Postgres, SELL prices only, the net never leaving the function (§15, 7.3).
--
-- One row per DEPARTURE, with the four occupancy prices side by side — because
-- an agent choosing a date is comparing "what does this leave at, and what
-- does a single cost", and returning four rows per departure would make them
-- reassemble it.
--
-- A departure is offered only if it is open, in the future, has seats left,
-- and has a rate covering its date. A departure with no rate is NOT free — it
-- is unpriced, and offering it would produce a failure at the booking step
-- instead of at search (§15, 7.4).
-- ----------------------------------------------------------------------------

create or replace function public.search_packages(
  p_from       date default current_date,
  p_to         date default null,
  p_country    text default null,
  p_city       text default null,
  p_query      text default null,
  p_travellers integer default 1
)
returns table (
  package_id       uuid,
  package_code     text,
  name_ar          text,
  name_en          text,
  summary_ar       text,
  summary_en       text,
  city_ar          text,
  city_en          text,
  country_code     char(2),
  duration_nights  smallint,
  cover_image      text,
  departure_id     uuid,
  departure_date   date,
  return_date      date,
  seats_left       smallint,
  currency_code    char(3),
  sell_single      numeric,
  sell_double      numeric,
  sell_triple      numeric,
  sell_child       numeric
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
  with markup as (
    -- Packages have no per-hotel scope, so this resolves agency-then-global.
    -- Passing NULL for the hotel makes the two hotel-scoped rules unmatchable,
    -- which is the intended fallback (same as `search_transfers`).
    select m.markup_type as m_type, m.markup_value as m_value
    from public.resolve_markup(v_agency_id, null) m
  ),
  priced as (
    select p.id as p_id, p.code as p_code,
           p.name_ar as n_ar, p.name_en as n_en,
           p.summary_ar as s_ar, p.summary_en as s_en,
           p.city_ar as c_ar, p.city_en as c_en, p.country_code as cc,
           p.duration_nights as nights, p.cover_image_public_id as img,
           d.id as d_id, d.departure_date as dep, d.return_date as ret,
           (d.capacity - d.seats_sold)::smallint as left_seats,
           r.currency_code as ccy,
           r.occupancy as occ,
           r.net_per_person as net
    from public.packages p
    join public.package_departures d
      on d.package_id = p.id
     and not d.is_closed
     and d.departure_date >= p_from
     and (p_to is null or d.departure_date <= p_to)
     and d.capacity - d.seats_sold >= p_travellers
    join public.package_rates r
      on r.package_id = p.id
     and r.valid_period @> d.departure_date
     and not r.is_closed
    where p.status = 'active'
      and (p_country is null or p.country_code = upper(p_country))
      and (p_city is null or p.city_en ilike p_city or p.city_ar ilike p_city)
      and (
        p_query is null
        or p.name_en ilike '%' || p_query || '%'
        or p.name_ar ilike '%' || p_query || '%'
        or p.city_en ilike '%' || p_query || '%'
        or p.city_ar ilike '%' || p_query || '%'
      )
  ),
  sold as (
    select pr.*,
           round(
             case (select m_type from markup)
               when 'percentage' then pr.net * (1 + coalesce((select m_value from markup), 0) / 100)
               when 'fixed'      then pr.net + coalesce((select m_value from markup), 0)
               else pr.net
             end,
           2) as sell
    from priced pr
  )
  -- One row per departure: the four occupancies pivot into columns.
  select s.p_id, s.p_code, s.n_ar, s.n_en, s.s_ar, s.s_en,
         s.c_ar, s.c_en, s.cc, s.nights, s.img,
         s.d_id, s.dep, s.ret, s.left_seats, s.ccy,
         max(s.sell) filter (where s.occ = 'single') as sell_single,
         max(s.sell) filter (where s.occ = 'double') as sell_double,
         max(s.sell) filter (where s.occ = 'triple') as sell_triple,
         max(s.sell) filter (where s.occ = 'child')  as sell_child
  from sold s
  group by s.p_id, s.p_code, s.n_ar, s.n_en, s.s_ar, s.s_en,
           s.c_ar, s.c_en, s.cc, s.nights, s.img,
           s.d_id, s.dep, s.ret, s.left_seats, s.ccy
  order by s.dep, s.n_en;
end;
$$;

revoke all on function public.search_packages(date, date, text, text, text, integer)
  from public, anon;
grant execute on function public.search_packages(date, date, text, text, text, integer)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 2. The net for one departure — never callable by an agent
-- ----------------------------------------------------------------------------

create or replace function public.package_net_total(
  p_departure_id uuid,
  p_single       integer default 0,
  p_double       integer default 0,
  p_triple       integer default 0,
  p_children     integer default 0
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(
    r.net_per_person * case r.occupancy
      when 'single' then p_single
      when 'double' then p_double
      when 'triple' then p_triple
      when 'child'  then p_children
    end
  ), 0)
  from public.package_departures d
  join public.package_rates r
    on r.package_id = d.package_id
   and r.valid_period @> d.departure_date
   and not r.is_closed
  where d.id = p_departure_id;
$$;

revoke all on function public.package_net_total(uuid, integer, integer, integer, integer)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Booking a package
--
-- Mirrors `create_booking` and `create_transfer_booking`: the price is
-- re-derived from the one search function, credit is checked before any row
-- exists, seats are held at creation, and the cost lands in the table agents
-- cannot read.
--
-- The traveller counts are four explicit integers rather than a JSON blob, so
-- the signature itself says what a package can be sold as.
-- ----------------------------------------------------------------------------

create or replace function public.create_package_booking(
  p_departure_id uuid,
  p_single       integer default 0,
  p_double       integer default 0,
  p_triple       integer default 0,
  p_children     integer default 0,
  p_guest_name   text default null,
  p_guest_email  text default null,
  p_guest_phone  text default null,
  p_requests     text default null,
  p_promo_code   text default null
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
  v_travellers  integer := coalesce(p_single, 0) + coalesce(p_double, 0)
                         + coalesce(p_triple, 0) + coalesce(p_children, 0);
  v_subtotal    numeric := 0;
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

  if v_travellers < 1 then
    raise exception 'A package booking needs at least one traveller.' using errcode = '22023';
  end if;

  -- 1. Re-derive the offer from the one search function (§15, 7.3). Searching
  --    from the departure's own date means a departure that has since closed,
  --    filled or lost its rate simply is not found.
  select sp.* into v_offer
  from public.package_departures d
  cross join lateral public.search_packages(
    d.departure_date, d.departure_date, null, null, null, v_travellers
  ) sp
  where d.id = p_departure_id
    and sp.departure_id = p_departure_id
  limit 1;

  if v_offer is null then
    raise exception 'That departure is no longer available.' using errcode = 'P0002';
  end if;

  if v_offer.departure_date < current_date then
    raise exception 'That departure has already left.' using errcode = '22023';
  end if;

  -- 2. The money. Each occupancy is priced per person and multiplied by its
  --    own count — the unit rule that Phase 7 found broken in the hotel path
  --    and that every product since has been written to respect (§15, 15.5).
  --    A count against an occupancy with no rate is refused rather than
  --    quietly charged at zero.
  if p_single > 0 then
    if v_offer.sell_single is null then
      raise exception 'This departure has no single rate.' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_offer.sell_single * p_single;
  end if;
  if p_double > 0 then
    if v_offer.sell_double is null then
      raise exception 'This departure has no double rate.' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_offer.sell_double * p_double;
  end if;
  if p_triple > 0 then
    if v_offer.sell_triple is null then
      raise exception 'This departure has no triple rate.' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_offer.sell_triple * p_triple;
  end if;
  if p_children > 0 then
    if v_offer.sell_child is null then
      raise exception 'This departure has no child rate.' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_offer.sell_child * p_children;
  end if;

  -- 3. Discount.
  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    select * into v_promo
    from public.evaluate_promo_code(p_promo_code, v_agency_id, v_subtotal, v_offer.departure_date);

    if not v_promo.is_valid then
      raise exception 'Promotion code cannot be used: %', v_promo.reason using errcode = '22023';
    end if;
    v_discount := v_promo.discount_amount;
    v_promo_code := v_promo.code;
    v_promo_id := v_promo.promo_id;
  end if;

  -- 4. Tax.
  select t.percent into v_tax_percent
  from public.tax_rates t where t.is_default and t.is_active limit 1;
  v_tax_percent := coalesce(v_tax_percent, 0);
  v_tax_amount := round((v_subtotal - v_discount) * v_tax_percent / 100, 2);
  v_total := v_subtotal - v_discount + v_tax_amount;

  -- 5. Credit, before any row exists (§15, 10.1).
  select * into v_agency from public.agencies where id = v_agency_id;
  v_outstanding := public.agency_balance(v_agency_id);

  if v_outstanding + v_total > v_agency.credit_limit then
    raise exception 'This booking would exceed the credit limit.' using errcode = 'P0003';
  end if;

  -- 6. Hold the seats. The CHECK on the table refuses an oversell itself, so
  --    two agents racing for the last seats cannot both win.
  update public.package_departures
     set seats_sold = seats_sold + v_travellers
   where id = p_departure_id;

  -- 7. The booking.
  v_reference := 'LLT-B-' || lpad(nextval('public.booking_ref_seq')::text, 6, '0');

  insert into public.bookings (
    reference, agency_id, agency_name, agency_code, created_by, status, product_type,
    check_in, check_out, nights,
    lead_guest_name, lead_guest_email, lead_guest_phone, special_requests,
    adults, children, rooms, currency_code,
    subtotal_sell, discount_amount, promo_code, tax_rate_percent, tax_amount, total_sell
  ) values (
    v_reference, v_agency_id, v_agency.name, v_agency.code, auth.uid(), 'pending', 'package',
    v_offer.departure_date, v_offer.return_date, v_offer.duration_nights,
    p_guest_name, p_guest_email, p_guest_phone, p_requests,
    v_travellers - coalesce(p_children, 0), coalesce(p_children, 0), v_travellers,
    v_offer.currency_code,
    v_subtotal, v_discount, v_promo_code, v_tax_percent, v_tax_amount, v_total
  )
  returning id into v_booking_id;

  -- 8. One item line per occupancy actually sold.
  insert into public.package_items (
    booking_id, package_id, departure_id,
    package_code, name_ar, name_en, city_ar, city_en, country_code, duration_nights,
    departure_date, return_date, occupancy, travellers,
    currency_code, sell_per_person, sell_total
  )
  select v_booking_id, v_offer.package_id, p_departure_id,
         v_offer.package_code, v_offer.name_ar, v_offer.name_en,
         v_offer.city_ar, v_offer.city_en, v_offer.country_code, v_offer.duration_nights,
         v_offer.departure_date, v_offer.return_date,
         line.occ, line.qty,
         v_offer.currency_code, line.price, line.price * line.qty
  from (
    values
      ('single'::public.package_occupancy, p_single,   v_offer.sell_single),
      ('double'::public.package_occupancy, p_double,   v_offer.sell_double),
      ('triple'::public.package_occupancy, p_triple,   v_offer.sell_triple),
      ('child'::public.package_occupancy,  p_children, v_offer.sell_child)
  ) as line(occ, qty, price)
  where line.qty > 0;

  -- 9. The cost, in the table agents cannot read (§15, 14.1).
  v_net := public.package_net_total(p_departure_id, p_single, p_double, p_triple, p_children);
  insert into public.booking_costs (booking_id, net_total, currency_code, sell_total)
  values (v_booking_id, v_net, v_offer.currency_code, v_total);

  if v_promo_id is not null then
    insert into public.promo_code_redemptions (promo_code_id, booking_id, agency_id, discount_amount)
    values (v_promo_id, v_booking_id, v_agency_id, v_discount);
  end if;

  perform public.write_audit('create', 'bookings', v_booking_id::text,
                             jsonb_build_object('reference', v_reference, 'product', 'package'));

  return query select v_booking_id, v_reference, v_total, v_offer.currency_code;
end;
$$;

revoke all on function public.create_package_booking(
  uuid, integer, integer, integer, integer, text, text, text, text, text) from public, anon;
grant execute on function public.create_package_booking(
  uuid, integer, integer, integer, integer, text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Cancelling gives the seats back
--
-- A TRIGGER rather than a branch inside `cancel_booking`, for two reasons: it
-- is strictly additive to a function that already works, and it fires whatever
-- path cancels the booking. The hotel release stays inline in `cancel_booking`
-- where Phase 5a put it — moving it here would risk a double release, and that
-- refactor deserves its own change rather than riding along with a new
-- product.
-- ----------------------------------------------------------------------------

create or replace function public.release_package_seats_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.package_departures d
       set seats_sold = greatest(d.seats_sold - agg.total, 0)
      from (
        select pi.departure_id, sum(pi.travellers)::int as total
        from public.package_items pi
        where pi.booking_id = new.id and pi.departure_id is not null
        group by pi.departure_id
      ) agg
     where d.id = agg.departure_id;
  end if;
  return new;
end;
$$;

revoke all on function public.release_package_seats_on_cancel()
  from public, anon, authenticated;

create trigger bookings_release_package_seats
  after update of status on public.bookings
  for each row execute function public.release_package_seats_on_cancel();
