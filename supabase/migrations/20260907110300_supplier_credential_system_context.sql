-- ============================================================================
-- Fix: supplier credential functions refused the system context
--
-- `set_supplier_credential` and `clear_supplier_credential` gate on
-- has_permission(auth.uid(), ...). Under the service role — or in the SQL
-- editor — auth.uid() is NULL, so the permission lookup returns false and both
-- functions raise. An ops script or a migration therefore could not rotate or
-- remove a supplier key at all; found when a cleanup script's call failed
-- silently and the credential stayed put.
--
-- This is the standing rule recorded in §15 after the bootstrap fix: a guard's
-- system-context escape must accept `auth.uid() IS NULL`, not only
-- `auth.role() = 'service_role'`. Safe here for the same reason as elsewhere —
-- both functions are revoked from `anon`, and every RLS policy on these tables
-- is scoped `to authenticated`, so a null uid means Postgres itself, a
-- migration, the service role, or the SQL editor.
-- ============================================================================

create or replace function public.set_supplier_credential(
  p_provider_key   text,
  p_credential_key text,
  p_value          text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_integration_id uuid;
  v_existing_id    uuid;
  v_secret_name    text;
begin
  -- A signed-in caller needs the permission; a system context is trusted.
  if auth.uid() is not null
     and not public.has_permission(auth.uid(), 'settings.suppliers.manage') then
    raise exception 'You do not have permission to manage supplier credentials.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_value), '') = '' then
    raise exception 'A credential value is required.' using errcode = '22023';
  end if;

  select id into v_integration_id
  from public.supplier_integrations where provider_key = p_provider_key;

  if v_integration_id is null then
    raise exception 'Unknown supplier: %', p_provider_key using errcode = 'P0002';
  end if;

  select vault_secret_id into v_existing_id
  from public.supplier_credentials
  where integration_id = v_integration_id and credential_key = p_credential_key;

  v_secret_name := 'supplier:' || p_provider_key || ':' || p_credential_key;

  if v_existing_id is null then
    v_existing_id := vault.create_secret(
      btrim(p_value), v_secret_name, 'Supplier credential managed from the back-office.'
    );
    insert into public.supplier_credentials (integration_id, credential_key, vault_secret_id, updated_by)
    values (v_integration_id, p_credential_key, v_existing_id, auth.uid());
  else
    perform vault.update_secret(v_existing_id, btrim(p_value), v_secret_name, null);
    update public.supplier_credentials
    set updated_at = now(), updated_by = auth.uid()
    where integration_id = v_integration_id and credential_key = p_credential_key;
  end if;

  perform public.write_audit('supplier.credential_set', 'supplier', p_provider_key,
    jsonb_build_object('credential', p_credential_key));
end;
$$;

create or replace function public.clear_supplier_credential(
  p_provider_key   text,
  p_credential_key text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_integration_id uuid;
  v_secret_id      uuid;
begin
  if auth.uid() is not null
     and not public.has_permission(auth.uid(), 'settings.suppliers.manage') then
    raise exception 'You do not have permission to manage supplier credentials.'
      using errcode = '42501';
  end if;

  select id into v_integration_id
  from public.supplier_integrations where provider_key = p_provider_key;

  select vault_secret_id into v_secret_id
  from public.supplier_credentials
  where integration_id = v_integration_id and credential_key = p_credential_key;

  if v_secret_id is null then return; end if;

  delete from public.supplier_credentials
  where integration_id = v_integration_id and credential_key = p_credential_key;

  delete from vault.secrets where id = v_secret_id;

  perform public.write_audit('supplier.credential_cleared', 'supplier', p_provider_key,
    jsonb_build_object('credential', p_credential_key));
end;
$$;

revoke all on function public.set_supplier_credential(text, text, text) from public, anon;
revoke all on function public.clear_supplier_credential(text, text)     from public, anon;
grant execute on function public.set_supplier_credential(text, text, text) to authenticated;
grant execute on function public.clear_supplier_credential(text, text)     to authenticated;
