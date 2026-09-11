-- ============================================================================
-- Phase 9 — Multi-Supplier Aggregation, Deduplication & Supplier Preferences
--
-- CLAUDE.md Phase 9 (Hotels B2B Hub integration):
--   1. Seed Phase 1 external bedbanks into supplier_integrations
--   2. hotel_supplier_mappings — mapping canonical hotels to external supplier IDs
--   3. agency_supplier_preferences — agency-level inclusion/exclusion of suppliers
--   4. enabled_supplier_keys_for_agency RPC — resolving active suppliers per agency
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed External Suppliers (Hotels B2B Hub & Vendor Proposal)
-- ----------------------------------------------------------------------------

insert into public.supplier_integrations
  (provider_key, display_name_ar, display_name_en, description_ar, description_en, is_enabled, environment, priority)
values
  ('hotelbeds',
   'هوتيل بيدز',
   'Hotelbeds',
   'بنك غرف فندقية عالمي يوفر أسعاراً فورية وعقوداً مباشرة حول العالم.',
   'Global bedbank providing wholesale hotel rates and direct contracts worldwide.',
   false, 'sandbox', 10),
  ('webbeds',
   'ويب بيدز',
   'WebBeds',
   'مزود B2B رائد لخدمات الإقامة الفندقية والسياحية وحزم السفر العالمية.',
   'Leading B2B global accommodation and hotel distribution marketplace.',
   false, 'sandbox', 20),
  ('tbo',
   'تي بي أو (TBO Holidays)',
   'TBO Holidays',
   'منصة سياحية عالمية B2B توفر مخزوناً فندقياً ضخماً وحزم سفر.',
   'Global travel distribution platform providing extensive hotel inventory and packages.',
   false, 'sandbox', 30),
  ('itrip',
   'آي تريب (itrip)',
   'itrip',
   'مزود فندقي وسياحي متخصص في الشرق الأوسط والخليج العربي.',
   'Regional hotel and travel inventory supplier specializing in the Middle East and GCC.',
   false, 'sandbox', 40),
  ('within_earth',
   'ويذن إيرث (Within Earth)',
   'Within Earth',
   'بنك غرف وتوزيع سياحي متخصص في الوجهات السياحية المتنوعة.',
   'Wholesale bedbank and travel aggregator specialized in regional and global destinations.',
   false, 'sandbox', 50),
  ('ratehawk',
   'ريت هوك (RateHawk)',
   'RateHawk',
   'منصة حجز فندقية للشركات تقدم عروضاً عالمية من آلاف الموردين الشركاء.',
   'B2B booking platform offering global hotel inventory from wholesale partners.',
   false, 'sandbox', 60)
on conflict (provider_key) do update
  set display_name_ar = excluded.display_name_ar,
      display_name_en = excluded.display_name_en,
      description_ar  = excluded.description_ar,
      description_en  = excluded.description_en,
      priority        = excluded.priority;

-- ----------------------------------------------------------------------------
-- 2. Hotel Supplier Mappings (Deduplication / Canonical Mapping)
-- ----------------------------------------------------------------------------

create table if not exists public.hotel_supplier_mappings (
  id                  uuid primary key default gen_random_uuid(),
  hotel_id            uuid not null references public.hotels (id) on delete cascade,
  supplier_key        text not null check (supplier_key ~ '^[a-z][a-z0-9_]{2,30}$'),
  supplier_hotel_ref  text not null,
  supplier_hotel_name text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,

  unique (supplier_key, supplier_hotel_ref)
);

create index if not exists idx_hotel_supplier_mappings_hotel
  on public.hotel_supplier_mappings (hotel_id);

create index if not exists idx_hotel_supplier_mappings_supplier
  on public.hotel_supplier_mappings (supplier_key, supplier_hotel_ref);

comment on table public.hotel_supplier_mappings is
  'Maps canonical hotels to external supplier property references for deduplication and rate aggregation.';

alter table public.hotel_supplier_mappings enable row level security;

create policy hotel_supplier_mappings_select
  on public.hotel_supplier_mappings for select to authenticated
  using (true);

create policy hotel_supplier_mappings_manage
  on public.hotel_supplier_mappings for all to authenticated
  using (public.authorize('hotels.create') or public.authorize('settings.suppliers.manage'))
  with check (public.authorize('hotels.create') or public.authorize('settings.suppliers.manage'));

-- ----------------------------------------------------------------------------
-- 3. Agency Supplier Preferences
-- ----------------------------------------------------------------------------

create table if not exists public.agency_supplier_preferences (
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  supplier_key  text not null check (supplier_key ~ '^[a-z][a-z0-9_]{2,30}$'),
  is_enabled    boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,

  primary key (agency_id, supplier_key)
);

comment on table public.agency_supplier_preferences is
  'Allows buyer admins and platform admins to enable or disable specific suppliers per agency.';

alter table public.agency_supplier_preferences enable row level security;

create policy agency_supplier_preferences_select
  on public.agency_supplier_preferences for select to authenticated
  using (
    agency_id = public.current_agency_id()
    or public.authorize('agencies.view')
    or public.authorize('settings.suppliers.manage')
  );

create policy agency_supplier_preferences_manage
  on public.agency_supplier_preferences for all to authenticated
  using (
    (agency_id = public.current_agency_id() and public.authorize('agency_users.manage'))
    or public.authorize('agencies.update')
    or public.authorize('settings.suppliers.manage')
  )
  with check (
    (agency_id = public.current_agency_id() and public.authorize('agency_users.manage'))
    or public.authorize('agencies.update')
    or public.authorize('settings.suppliers.manage')
  );

-- ----------------------------------------------------------------------------
-- 4. Supplier Resolution RPCs
-- ----------------------------------------------------------------------------

create or replace function public.enabled_supplier_keys_for_agency(p_agency_id uuid default null)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select si.provider_key
  from public.supplier_integrations si
  left join public.agency_supplier_preferences asp
    on asp.supplier_key = si.provider_key
   and asp.agency_id = coalesce(p_agency_id, public.current_agency_id())
  where si.is_enabled
    and coalesce(asp.is_enabled, true) = true
    and (public.is_active_user() or auth.role() = 'service_role' or auth.uid() is null)
  order by si.priority, si.provider_key;
$$;

revoke all on function public.enabled_supplier_keys_for_agency(uuid) from public, anon;
grant execute on function public.enabled_supplier_keys_for_agency(uuid) to authenticated;

create or replace function public.set_agency_supplier_preference(
  p_agency_id    uuid,
  p_supplier_key text,
  p_is_enabled   boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (
    auth.role() = 'service_role'
    or auth.uid() is null
    or (p_agency_id = public.current_agency_id() and public.has_permission(auth.uid(), 'agency_users.manage'))
    or public.has_permission(auth.uid(), 'agencies.update')
    or public.has_permission(auth.uid(), 'settings.suppliers.manage')
  ) then
    raise exception 'You do not have permission to manage supplier preferences for this agency.'
      using errcode = '42501';
  end if;

  insert into public.agency_supplier_preferences (agency_id, supplier_key, is_enabled, updated_at, updated_by)
  values (p_agency_id, p_supplier_key, p_is_enabled, now(), auth.uid())
  on conflict (agency_id, supplier_key) do update
    set is_enabled = excluded.is_enabled,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

revoke all on function public.set_agency_supplier_preference(uuid, text, boolean) from public, anon;
grant execute on function public.set_agency_supplier_preference(uuid, text, boolean) to authenticated;
