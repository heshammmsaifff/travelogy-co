-- ============================================================================
-- Phase 5b — bookings gain a price breakdown, and the account gets a statement
--
-- `total_sell` keeps its meaning: what the agent owes. What changes is that a
-- booking can now say HOW that number was reached — room total, discount, tax
-- — because an invoice that shows only a total is not an invoice.
--
-- The breakdown columns are additive and computed in `create_booking`, so
-- existing bookings keep working: their subtotal equals their total and both
-- other figures are zero, which is exactly what they were.
-- ============================================================================

alter table public.bookings
  add column subtotal_sell     numeric(14, 2) not null default 0 check (subtotal_sell >= 0),
  add column discount_amount   numeric(14, 2) not null default 0 check (discount_amount >= 0),
  add column promo_code        text,
  add column tax_rate_percent  numeric(6, 3) not null default 0 check (tax_rate_percent >= 0),
  add column tax_amount        numeric(14, 2) not null default 0 check (tax_amount >= 0);

comment on column public.bookings.subtotal_sell is
  'Room total before discount and tax. total_sell = subtotal_sell - discount_amount + tax_amount, and that identity is enforced by a CHECK.';

-- Backfill before the constraint, so the identity holds for what already exists.
update public.bookings
   set subtotal_sell = total_sell
 where subtotal_sell = 0 and total_sell > 0;

-- The identity is a constraint rather than a convention: a breakdown that does
-- not add up to the amount charged is worse than no breakdown at all.
alter table public.bookings
  add constraint bookings_totals_add_up
  check (total_sell = subtotal_sell - discount_amount + tax_amount);

-- ----------------------------------------------------------------------------
-- 1. Promo validation, callable on its own so the booking form can preview it
-- ----------------------------------------------------------------------------

create or replace function public.evaluate_promo_code(
  p_code    text,
  p_agency_id uuid,
  p_subtotal  numeric,
  p_stay_date date default current_date
)
returns table (promo_id uuid, code text, discount numeric, reason text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_promo   record;
  v_used    integer;
  v_discount numeric;
begin
  select * into v_promo
  from public.promo_codes
  where upper(btrim(p_code)) = code
  limit 1;

  -- Every rejection names its reason. "Invalid code" for an expired one sends
  -- the agent to retype something that was never going to work.
  if v_promo is null then
    return query select null::uuid, null::text, 0::numeric, 'not_found'::text;
    return;
  end if;

  if not v_promo.is_active then
    return query select v_promo.id, v_promo.code, 0::numeric, 'inactive'::text;
    return;
  end if;

  if p_stay_date < v_promo.valid_from or p_stay_date > v_promo.valid_to then
    return query select v_promo.id, v_promo.code, 0::numeric, 'out_of_window'::text;
    return;
  end if;

  if v_promo.agency_id is not null and v_promo.agency_id <> p_agency_id then
    -- Deliberately the same answer as a missing code: telling an agent that a
    -- code exists but belongs to someone else leaks a competitor's deal.
    return query select null::uuid, null::text, 0::numeric, 'not_found'::text;
    return;
  end if;

  if v_promo.min_booking_total is not null and p_subtotal < v_promo.min_booking_total then
    return query select v_promo.id, v_promo.code, 0::numeric, 'below_minimum'::text;
    return;
  end if;

  if v_promo.max_redemptions is not null and v_promo.times_used >= v_promo.max_redemptions then
    return query select v_promo.id, v_promo.code, 0::numeric, 'exhausted'::text;
    return;
  end if;

  if v_promo.max_per_agency is not null then
    select count(*) into v_used
    from public.promo_code_redemptions r
    where r.promo_code_id = v_promo.id and r.agency_id = p_agency_id;

    if v_used >= v_promo.max_per_agency then
      return query select v_promo.id, v_promo.code, 0::numeric, 'agency_limit'::text;
      return;
    end if;
  end if;

  v_discount := case
    when v_promo.discount_type = 'percentage' then p_subtotal * v_promo.discount_value / 100
    else v_promo.discount_value
  end;

  if v_promo.max_discount is not null then
    v_discount := least(v_discount, v_promo.max_discount);
  end if;

  -- A discount larger than the booking would make the total negative.
  v_discount := round(least(v_discount, p_subtotal), 2);

  return query select v_promo.id, v_promo.code, v_discount, 'ok'::text;
end;
$$;

revoke all on function public.evaluate_promo_code(text, uuid, numeric, date) from public, anon;
grant execute on function public.evaluate_promo_code(text, uuid, numeric, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. create_booking, now with discount and tax
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
  v_tax         record;
  v_nights      integer := p_check_out - p_check_in;
  v_outstanding numeric;
  v_subtotal    numeric;
  v_discount    numeric := 0;
  v_tax_amount  numeric := 0;
  v_tax_percent numeric := 0;
  v_total       numeric;
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

  -- 2. Discount. An unusable code is REFUSED rather than quietly ignored —
  --    charging full price on a booking the agent thought was discounted is
  --    the kind of silent difference that ends in a dispute.
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

  -- Recorded inside the same transaction, so a code cannot be counted for a
  -- booking that failed to write.
  if v_promo_id is not null then
    insert into public.promo_code_redemptions (promo_code_id, booking_id, agency_id, discount_amount)
    values (v_promo_id, v_booking_id, v_agency_id, v_discount);
  end if;

  perform public.write_audit('create', 'bookings', v_booking_id::text,
                             jsonb_build_object('reference', v_reference, 'total', v_total));

  return query select v_booking_id, v_reference, v_total, v_offer.currency_code;
end;
$$;

-- The old 12-argument signature would otherwise linger and be resolvable.
drop function if exists public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid);

revoke all on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. The statement of account
--
-- A union of the two sides of the ledger with a running balance, computed in
-- Postgres (§11). Debits are bookings that still stand; credits are payments.
-- Nothing here reads a stored balance, because there is not one.
-- ----------------------------------------------------------------------------

create or replace function public.agency_statement(
  p_agency_id uuid,
  p_from      date default null,
  p_to        date default null
)
returns table (
  entry_date    date,
  entry_type    text,
  reference     text,
  description   text,
  debit         numeric,
  credit        numeric,
  running_balance numeric,
  currency_code char(3)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- The caller must be a member of this agency, or hold the permission.
  if auth.uid() is not null
     and not public.has_permission(auth.uid(), 'finance.statements.view')
     and not (p_agency_id = public.current_agency_id() and public.is_active_user()) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  with entries as (
    select b.created_at::date            as entry_date,
           'booking'::text               as entry_type,
           b.reference                   as reference,
           coalesce(b.agency_name, '') || ' · ' || b.lead_guest_name as description,
           b.total_sell                  as debit,
           0::numeric                    as credit,
           b.currency_code               as currency_code,
           b.created_at                  as sort_key
    from public.bookings b
    where b.agency_id = p_agency_id
      and b.status in ('pending', 'confirmed', 'completed')

    union all

    select p.paid_on,
           case p.kind when 'refund' then 'refund' else 'payment' end,
           p.reference,
           coalesce(p.external_reference, p.method::text),
           -- A refund puts money back to the agent, so it increases what they
           -- owe again. Modelling it as a debit keeps every row positive and
           -- the running balance honest.
           case p.kind when 'refund' then p.amount else 0::numeric end,
           case p.kind when 'refund' then 0::numeric else p.amount end,
           p.currency_code,
           p.created_at
    from public.payments p
    where p.agency_id = p_agency_id
  ),
  filtered as (
    select * from entries
    where (p_from is null or entry_date >= p_from)
      and (p_to   is null or entry_date <= p_to)
  )
  select f.entry_date, f.entry_type, f.reference, f.description, f.debit, f.credit,
         sum(f.debit - f.credit) over (order by f.sort_key, f.reference
                                       rows between unbounded preceding and current row),
         f.currency_code
  from filtered f
  order by f.sort_key, f.reference;
end;
$$;

revoke all on function public.agency_statement(uuid, date, date) from public, anon;
grant execute on function public.agency_statement(uuid, date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Balance, and the credit summary that now accounts for payments
-- ----------------------------------------------------------------------------

create or replace function public.agency_balance(p_agency_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.agency_outstanding(p_agency_id)
       - coalesce((select sum(case when kind = 'refund' then -amount else amount end)
                   from public.payments where agency_id = p_agency_id), 0);
$$;

comment on function public.agency_balance(uuid) is
  'What the agency owes right now: standing bookings minus recorded payments (§10). Never stored.';

revoke all on function public.agency_balance(uuid) from public, anon, authenticated;

-- Postgres refuses to change a function's return type in place, and this one
-- gains `paid` and `balance` columns — so it is dropped and recreated rather
-- than replaced.
drop function if exists public.my_credit_summary();

create function public.my_credit_summary()
returns table (credit_limit numeric, outstanding numeric, paid numeric, balance numeric,
               available numeric, currency_code char(3))
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_id uuid := public.current_agency_id();
begin
  if not public.is_active_user() or v_agency_id is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select a.credit_limit,
         public.agency_outstanding(a.id),
         coalesce((select sum(case when kind = 'refund' then -amount else amount end)
                   from public.payments where agency_id = a.id), 0),
         public.agency_balance(a.id),
         -- Available credit is measured against the BALANCE, not gross
         -- bookings: paying settles the account and frees the headroom again.
         a.credit_limit - public.agency_balance(a.id),
         a.currency_code
  from public.agencies a
  where a.id = v_agency_id;
end;
$$;

revoke all on function public.my_credit_summary() from public, anon;
grant execute on function public.my_credit_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Receivables, for the finance dashboard
-- ----------------------------------------------------------------------------

create or replace function public.receivables_summary()
returns table (
  agency_id     uuid,
  agency_name   text,
  agency_code   text,
  credit_limit  numeric,
  outstanding   numeric,
  paid          numeric,
  balance       numeric,
  currency_code char(3)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'finance.statements.view') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select a.id, a.name, a.code, a.credit_limit,
         public.agency_outstanding(a.id),
         coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end)
                   from public.payments p where p.agency_id = a.id), 0),
         public.agency_balance(a.id),
         a.currency_code
  from public.agencies a
  where a.status = 'active'
  order by public.agency_balance(a.id) desc;
end;
$$;

revoke all on function public.receivables_summary() from public, anon;
grant execute on function public.receivables_summary() to authenticated;
