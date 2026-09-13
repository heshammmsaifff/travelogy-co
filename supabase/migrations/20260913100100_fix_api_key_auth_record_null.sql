-- ============================================================================
-- FIX — every API key WITHOUT an IP allow-list was rejected as invalid
--
-- `authenticate_b2b_api_key` tested `if v_rec is not null`. On a composite
-- value, IS NOT NULL is true only when EVERY field is non-null — and
-- `allowed_ips` is null for any key that has no allow-list, which is the
-- default and the common case. So those keys never authenticated, while a key
-- with an allow-list did. Found by the Phase 9/10 verification run: the only
-- key that got through was the one restricted to a single IP.
--
-- `FOUND` says what was meant: whether the SELECT INTO matched a row.
-- ============================================================================

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

  if found then
    update public.agency_api_keys k
       set last_used_at = now()
     where k.id = v_rec.id;

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

-- `create or replace` keeps existing grants; restated so the file is the
-- whole truth about who may call it.
revoke all on function public.authenticate_b2b_api_key(text) from public, anon, authenticated;
grant execute on function public.authenticate_b2b_api_key(text) to service_role;
