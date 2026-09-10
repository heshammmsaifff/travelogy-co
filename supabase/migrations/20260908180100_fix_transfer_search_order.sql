-- ============================================================================
-- Phase 8a fix — search_transfers() failed on every call
--
-- `order by 20 asc` referred to a select-list position that does not exist: the
-- function returns 19 columns, and I counted the RETURNS TABLE rather than the
-- SELECT. Postgres refused every call with
--
--     ORDER BY position 20 is not in select list
--
-- so search, and therefore booking, was completely non-functional. The
-- verification suite caught it on its first run.
--
-- Ordering by a positional index was the mistake, not the number. The sort is
-- now written as the expression itself, which cannot drift when a column is
-- added or removed.
-- ============================================================================

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
  if not public.is_active_user() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  with priced as (
    select r.id as r_id, r.code as r_code,
           r.from_name_ar as f_ar, r.from_name_en as f_en,
           r.to_name_ar as t_ar, r.to_name_en as t_en,
           r.city_ar as c_ar, r.city_en as c_en, r.country_code as cc,
           r.direction as dir, r.duration_minutes as mins,
           v.id as v_id, v.name_ar as v_ar, v.name_en as v_en,
           v.max_passengers as pax, v.max_luggage as bags, v.image_public_id as img,
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
           -- Transfers have no route-level markup scope, so a NULL hotel makes
           -- the two hotel-scoped rules unmatchable and this resolves
           -- agency-then-global, which is the intended fallback.
           (select m.markup_type  from public.resolve_markup(v_agency_id, null) m) as m_type,
           (select m.markup_value from public.resolve_markup(v_agency_id, null) m) as m_value
    from priced p
  ),
  sellable as (
    select m.*,
           round(
             case m.m_type
               when 'percentage' then m.net * (1 + coalesce(m.m_value, 0) / 100)
               when 'fixed'      then m.net + coalesce(m.m_value, 0)
               else m.net
             end,
           2) as sell
    from marked m
  )
  select s.r_id, s.r_code, s.f_ar, s.f_en, s.t_ar, s.t_en,
         s.c_ar, s.c_en, s.cc, s.dir, s.mins,
         s.v_id, s.v_ar, s.v_en, s.pax, s.bags, s.img,
         s.ccy, s.sell
  from sellable s
  order by s.sell asc, s.v_en asc;
end;
$$;

revoke all on function public.search_transfers(date, integer, text, text, text) from public, anon;
grant execute on function public.search_transfers(date, integer, text, text, text) to authenticated;
