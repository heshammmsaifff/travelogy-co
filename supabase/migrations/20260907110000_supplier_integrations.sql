-- ============================================================================
-- Phase 3b — external supplier registry and credentials
--
-- CLAUDE.md §9: supplier API keys are entered by the super_admin from the
-- back-office and stored encrypted in Supabase Vault — never as environment
-- variables, never in a plaintext column, never returned to the browser.
--
-- Two tables:
--   supplier_integrations — the NON-SECRET configuration for each provider
--   supplier_credentials  — one row per named credential, holding only a
--                           REFERENCE to a Vault secret, never the value
--
-- Different providers need different credential fields (RateHawk wants a key
-- id and an API key; Hotelbeds wants an API key and a shared secret), so the
-- credential set is rows rather than fixed columns.
-- ============================================================================

create type public.supplier_environment as enum ('sandbox', 'production');

create table public.supplier_integrations (
  id                uuid primary key default gen_random_uuid(),

  -- Matches the adapter's `key` in the code; this is how a row and its
  -- implementation find each other.
  provider_key      text not null unique
                    check (provider_key ~ '^[a-z][a-z0-9_]{2,30}$'),

  display_name_ar   text not null,
  display_name_en   text not null,
  description_ar    text,
  description_en    text,

  -- Off by default. A provider with no credentials that silently participated
  -- in search would produce confusing empty results.
  is_enabled        boolean not null default false,
  environment       public.supplier_environment not null default 'sandbox',

  -- Ordering when several providers return the same hotel.
  priority          integer not null default 100,

  -- Result of the last connection test, so an admin can see whether the
  -- credentials they entered actually work without guessing.
  last_tested_at    timestamptz,
  last_test_ok      boolean,
  last_test_message text,

  updated_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.supplier_integrations is
  'Non-secret configuration per external supplier. Secret values live in Vault, referenced from supplier_credentials.';

create table public.supplier_credentials (
  integration_id  uuid not null references public.supplier_integrations (id) on delete cascade,

  -- 'key_id', 'api_key', 'secret', ... whatever that provider needs.
  credential_key  text not null check (credential_key ~ '^[a-z][a-z0-9_]{2,40}$'),

  -- The Vault row holding the encrypted value. Useless on its own: reading it
  -- requires vault access, which no client role has.
  vault_secret_id uuid not null,

  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null,

  primary key (integration_id, credential_key)
);

comment on column public.supplier_credentials.vault_secret_id is
  'Reference only. The plaintext never exists in this schema.';

create trigger supplier_integrations_set_updated_at
  before update on public.supplier_integrations
  for each row execute function public.set_updated_at();

alter table public.supplier_integrations enable row level security;
alter table public.supplier_credentials  enable row level security;

-- ============================================================================
-- RLS
--
-- Both tables are gated on settings.suppliers.manage. `supplier_credentials`
-- is readable so the screen can show WHICH credentials are set and when they
-- changed — it holds no values, only Vault references.
--
-- Neither table has an INSERT/UPDATE policy for credentials: those go through
-- the functions below, so a client cannot point a credential row at an
-- arbitrary Vault secret.
-- ============================================================================

create policy supplier_integrations_select
  on public.supplier_integrations for select to authenticated
  using (public.authorize('settings.suppliers.manage'));

create policy supplier_integrations_update
  on public.supplier_integrations for update to authenticated
  using (public.authorize('settings.suppliers.manage'))
  with check (public.authorize('settings.suppliers.manage'));

create policy supplier_credentials_select
  on public.supplier_credentials for select to authenticated
  using (public.authorize('settings.suppliers.manage'));

-- ============================================================================
-- Credential functions
-- ============================================================================

/**
 * Stores or replaces one credential for a provider.
 *
 * The plaintext reaches Postgres only as an argument and is handed straight to
 * Vault; nothing in the `public` schema ever holds it. Rotating means calling
 * this again with a new value — there is deliberately no way to read the old
 * one back through any client-reachable path.
 */
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
  if not public.has_permission(auth.uid(), 'settings.suppliers.manage') then
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
      btrim(p_value),
      v_secret_name,
      'Supplier credential managed from the back-office.'
    );

    insert into public.supplier_credentials (integration_id, credential_key, vault_secret_id, updated_by)
    values (v_integration_id, p_credential_key, v_existing_id, auth.uid());
  else
    perform vault.update_secret(v_existing_id, btrim(p_value), v_secret_name, null);

    update public.supplier_credentials
    set updated_at = now(), updated_by = auth.uid()
    where integration_id = v_integration_id and credential_key = p_credential_key;
  end if;

  -- The value is never logged. Only the fact that it changed.
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
  if not public.has_permission(auth.uid(), 'settings.suppliers.manage') then
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

/**
 * Reads a decrypted credential.
 *
 * SERVICE ROLE ONLY — revoked from `authenticated` and `anon` below, and it
 * re-checks the caller itself. This is the one function in the schema that can
 * produce a supplier secret in plaintext, so it is the one that matters most:
 * it is called from inside a provider adapter on the server and nowhere else.
 */
create or replace function public.read_supplier_credential(
  p_provider_key   text,
  p_credential_key text
)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
  v_value     text;
begin
  -- Belt and braces: the EXECUTE grant already excludes every client role, but
  -- a future grant made by mistake should not silently open this up.
  if auth.role() is not null and auth.role() <> 'service_role' then
    raise exception 'Supplier credentials are not readable through the API.'
      using errcode = '42501';
  end if;

  select sc.vault_secret_id into v_secret_id
  from public.supplier_credentials sc
  join public.supplier_integrations si on si.id = sc.integration_id
  where si.provider_key = p_provider_key
    and sc.credential_key = p_credential_key;

  if v_secret_id is null then return null; end if;

  select decrypted_secret into v_value
  from vault.decrypted_secrets where id = v_secret_id;

  return v_value;
end;
$$;

revoke all on function public.set_supplier_credential(text, text, text)   from public, anon;
revoke all on function public.clear_supplier_credential(text, text)       from public, anon;
revoke all on function public.read_supplier_credential(text, text)        from public, anon, authenticated;

grant execute on function public.set_supplier_credential(text, text, text) to authenticated;
grant execute on function public.clear_supplier_credential(text, text)     to authenticated;

-- ============================================================================
-- Seed: the sandbox provider
--
-- Deliberately named and labelled as a test provider (CLAUDE.md §2.3). It
-- proves the port, the registry, result merging and the credential plumbing
-- without claiming an integration with a real supplier we have no contract
-- with. Disabled until an admin turns it on.
-- ============================================================================

insert into public.supplier_integrations
  (provider_key, display_name_ar, display_name_en, description_ar, description_en, is_enabled, environment, priority)
values
  ('sandbox',
   'مورد تجريبي (اختبار)',
   'Sandbox supplier (test)',
   'مورد وهمي لإثبات عمل طبقة الموردين. لا يتصل بأي نظام خارجي ولا يُستخدم في الإنتاج.',
   'A fake supplier used to prove the provider layer works. It contacts nothing external and is not for production use.',
   false, 'sandbox', 900)
on conflict (provider_key) do update
  set display_name_ar = excluded.display_name_ar,
      display_name_en = excluded.display_name_en,
      description_ar  = excluded.description_ar,
      description_en  = excluded.description_en;
