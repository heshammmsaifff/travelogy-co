-- ============================================================================
-- Phase 5b fix — `evaluate_promo_code` could not read a promo code at all
--
-- The function declares an OUT column named `code`, and its lookup was written
-- as `where upper(btrim(p_code)) = code`. Inside a plpgsql function an OUT
-- parameter is a variable, so `code` was ambiguous between that variable and
-- `promo_codes.code`, and Postgres refused the query outright:
--
--     column reference "code" is ambiguous
--
-- Every promo path failed with it — evaluation, and any booking that carried a
-- code. Nothing was silently wrong; it simply never worked, which the
-- verification suite caught on its first run.
--
-- The table is now aliased and every column qualified, which is the habit that
-- prevents this rather than the specific rename.
-- ============================================================================

create or replace function public.evaluate_promo_code(
  p_code      text,
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
  v_promo    record;
  v_used     integer;
  v_discount numeric;
begin
  select pc.* into v_promo
  from public.promo_codes pc
  where pc.code = upper(btrim(p_code))
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
    where r.promo_code_id = v_promo.id
      and r.agency_id = p_agency_id;

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
