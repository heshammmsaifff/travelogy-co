-- ============================================================================
-- Phase 7 — reports
--
-- All three run entirely in Postgres and return rows already aggregated (§11).
-- None of them is a view: a view cannot take a date range, and `security_invoker`
-- views leak counts of rows the caller cannot see unless every underlying policy
-- lines up (§15, 3.6). A SECURITY DEFINER function with one explicit permission
-- check at the top is easier to reason about and easier to audit.
--
-- Every one of them exposes MARGIN, so every one of them demands
-- `reports.view`. That permission is the whole gate: an agent holding a real
-- token gets nothing from these but an exception.
-- ============================================================================

-- Shared guard. Written once so the three reports cannot drift apart on who
-- may read them.
create or replace function public.assert_can_report()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Standing rule (§15, 5.x): a null auth.uid() is a system context.
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'reports.view') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_can_report() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. Bookings report — one row per booking, with its margin
-- ----------------------------------------------------------------------------

create or replace function public.report_bookings(
  p_from      date default null,
  p_to        date default null,
  p_status    text default null,
  p_agency_id uuid default null,
  p_hotel_id  uuid default null
)
returns table (
  reference     text,
  booked_on     date,
  status        text,
  agency_name   text,
  agency_code   text,
  hotel_name_ar text,
  hotel_name_en text,
  guest_name    text,
  check_in      date,
  check_out     date,
  nights        smallint,
  rooms         smallint,
  room_nights   integer,
  currency_code char(3),
  sell_total    numeric,
  net_total     numeric,
  margin        numeric,
  margin_pct    numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_can_report();

  return query
  select b.reference,
         b.created_at::date,
         b.status::text,
         b.agency_name,
         b.agency_code,
         bi.hotel_name_ar,
         bi.hotel_name_en,
         b.lead_guest_name,
         b.check_in,
         b.check_out,
         b.nights,
         b.rooms,
         (b.nights * b.rooms)::integer,
         b.currency_code,
         b.total_sell,
         bc.net_total,
         -- A booking made before Phase 7 has no cost row, so its margin is
         -- NULL rather than equal to its full sell price. Reporting an unknown
         -- cost as zero profit would overstate every early booking (§2.3).
         case when bc.net_total is null then null else b.total_sell - bc.net_total end,
         case
           when bc.net_total is null or b.total_sell = 0 then null
           else round((b.total_sell - bc.net_total) / b.total_sell * 100, 2)
         end
  from public.bookings b
  left join lateral (
    select bi2.hotel_name_ar, bi2.hotel_name_en, bi2.hotel_id
    from public.booking_items bi2
    where bi2.booking_id = b.id
    order by bi2.created_at
    limit 1
  ) bi on true
  left join public.booking_costs bc on bc.booking_id = b.id
  where (p_from is null or b.created_at::date >= p_from)
    and (p_to   is null or b.created_at::date <= p_to)
    and (p_status is null or b.status::text = p_status)
    and (p_agency_id is null or b.agency_id = p_agency_id)
    and (p_hotel_id is null or bi.hotel_id = p_hotel_id)
  order by b.created_at desc
  limit 5000;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Agent performance
--
-- Cancellations are counted but excluded from the money, because a cancelled
-- booking earns nothing — reporting its sell value as revenue would make a
-- serial canceller look like the best agent on the list.
-- ----------------------------------------------------------------------------

create or replace function public.report_agent_performance(
  p_from date default null,
  p_to   date default null
)
returns table (
  agency_id        uuid,
  agency_name      text,
  agency_code      text,
  bookings_total   integer,
  bookings_live    integer,
  bookings_cancelled integer,
  cancellation_pct numeric,
  room_nights      integer,
  currency_code    char(3),
  sell_total       numeric,
  net_total        numeric,
  margin           numeric,
  margin_pct       numeric,
  paid_total       numeric,
  balance          numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_can_report();

  return query
  with scoped as (
    select b.*, bc.net_total as cost
    from public.bookings b
    left join public.booking_costs bc on bc.booking_id = b.id
    where (p_from is null or b.created_at::date >= p_from)
      and (p_to   is null or b.created_at::date <= p_to)
  ),
  grouped as (
    select a.id, a.name, a.code, a.currency_code as ccy,
           count(s.id)::integer as total,
           count(s.id) filter (where s.status <> 'cancelled')::integer as live,
           count(s.id) filter (where s.status = 'cancelled')::integer as cancelled,
           coalesce(sum(s.nights * s.rooms) filter (where s.status <> 'cancelled'), 0)::integer as rn,
           coalesce(sum(s.total_sell) filter (where s.status <> 'cancelled'), 0) as sell,
           coalesce(sum(s.cost) filter (where s.status <> 'cancelled'), 0) as net
    from public.agencies a
    left join scoped s on s.agency_id = a.id
    where a.status = 'active'
    group by a.id, a.name, a.code, a.currency_code
  )
  select g.id, g.name, g.code,
         g.total, g.live, g.cancelled,
         case when g.total = 0 then 0 else round(g.cancelled::numeric / g.total * 100, 2) end,
         g.rn, g.ccy,
         g.sell, g.net,
         g.sell - g.net,
         case when g.sell = 0 then 0 else round((g.sell - g.net) / g.sell * 100, 2) end,
         coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end)
                   from public.payments p where p.agency_id = g.id), 0),
         public.agency_balance(g.id)
  from grouped g
  order by g.sell desc, g.name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Hotel performance
-- ----------------------------------------------------------------------------

create or replace function public.report_hotel_performance(
  p_from date default null,
  p_to   date default null
)
returns table (
  hotel_id       uuid,
  hotel_code     text,
  hotel_name_ar  text,
  hotel_name_en  text,
  city_ar        text,
  city_en        text,
  bookings_live  integer,
  room_nights    integer,
  currency_code  char(3),
  sell_total     numeric,
  net_total      numeric,
  margin         numeric,
  margin_pct     numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_can_report();

  return query
  select h.id, h.code, h.name_ar, h.name_en, h.city_ar, h.city_en,
         count(distinct b.id)::integer,
         coalesce(sum(b.nights * b.rooms), 0)::integer,
         max(b.currency_code),
         coalesce(sum(b.total_sell), 0),
         coalesce(sum(bc.net_total), 0),
         coalesce(sum(b.total_sell), 0) - coalesce(sum(bc.net_total), 0),
         case
           when coalesce(sum(b.total_sell), 0) = 0 then 0
           else round((coalesce(sum(b.total_sell), 0) - coalesce(sum(bc.net_total), 0))
                      / sum(b.total_sell) * 100, 2)
         end
  from public.hotels h
  left join public.booking_items bi on bi.hotel_id = h.id
  left join public.bookings b
         on b.id = bi.booking_id
        and b.status <> 'cancelled'
        and (p_from is null or b.created_at::date >= p_from)
        and (p_to   is null or b.created_at::date <= p_to)
  left join public.booking_costs bc on bc.booking_id = b.id
  group by h.id, h.code, h.name_ar, h.name_en, h.city_ar, h.city_en
  order by coalesce(sum(b.total_sell), 0) desc, h.name_en;
end;
$$;

revoke all on function public.report_bookings(date, date, text, uuid, uuid)  from public, anon;
revoke all on function public.report_agent_performance(date, date)           from public, anon;
revoke all on function public.report_hotel_performance(date, date)           from public, anon;
grant execute on function public.report_bookings(date, date, text, uuid, uuid) to authenticated;
grant execute on function public.report_agent_performance(date, date)          to authenticated;
grant execute on function public.report_hotel_performance(date, date)          to authenticated;
