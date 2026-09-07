-- ============================================================================
-- Phase 3b — which suppliers a search should query
--
-- `supplier_integrations` is gated on settings.suppliers.manage, so an agent
-- running a search cannot read it — and should not: the table carries the
-- provider's operational configuration and its last connection-test message.
--
-- But the search still has to know which suppliers are switched on. This
-- returns nothing but the enabled provider keys: no credentials, no test
-- output, no configuration. A key alone grants nothing, since actually using a
-- supplier requires credentials only the service role can read.
-- ============================================================================

create or replace function public.enabled_supplier_keys()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select si.provider_key
  from public.supplier_integrations si
  where si.is_enabled
    -- Only for an active account; a suspended agent gets an empty search
    -- rather than a list of the client's supplier relationships.
    and public.is_active_user()
  order by si.priority, si.provider_key;
$$;

revoke all on function public.enabled_supplier_keys() from public, anon;
grant execute on function public.enabled_supplier_keys() to authenticated;
