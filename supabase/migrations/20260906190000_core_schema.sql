-- ============================================================================
-- Phase 1 — core schema
--
-- Tables: roles, permissions, role_permissions, agencies, profiles, audit_log.
-- RLS is enabled here but the policies themselves live in the RLS migration,
-- so this file stays readable as "what exists" and that one as "who may see it".
--
-- CLAUDE.md §7 (roles/permissions), §10 (credit account), §12 (RLS everywhere).
-- ============================================================================

-- ---------------------------------------------------------------- extensions
create extension if not exists "pgcrypto" with schema extensions;

-- --------------------------------------------------------------------- enums

-- Lifecycle of a person's account. `pending` is the state a self-registered
-- agent sits in until an admin approves them (CLAUDE.md §13, Phase 1).
create type public.user_status as enum ('pending', 'active', 'suspended', 'rejected');

-- Lifecycle of an agent company. Kept separate from user_status because a
-- company can be suspended while its owner's login stays valid, and vice versa.
create type public.agency_status as enum ('pending', 'active', 'suspended', 'rejected');

-- Which side of the product a role belongs to. Present from the first
-- migration so agent-scoped custom roles are later a data change, not a
-- schema rewrite (CLAUDE.md §15, decision 1.7).
create type public.role_scope as enum ('admin', 'agent');

-- --------------------------------------------------------------------- roles

create table public.roles (
  id            uuid primary key default gen_random_uuid(),

  -- Stable machine key. Code and seeds refer to this, never to the label.
  key           text not null unique
                check (key ~ '^[a-z][a-z0-9_]{2,49}$'),

  scope         public.role_scope not null,

  -- Bilingual labels (CLAUDE.md §5: no hardcoded UI strings).
  name_ar       text not null,
  name_en       text not null,
  description_ar text,
  description_en text,

  -- System roles cannot be deleted or renamed. Enforced by trigger, because a
  -- CHECK constraint cannot see the difference between an insert and an update.
  is_system     boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.roles is
  'Roles are rows, not hardcoded strings. super_admin creates custom ones from the back-office (CLAUDE.md §7).';

-- --------------------------------------------------------------- permissions

-- The permission registry. Seeded by migration and extended by migration when
-- a module adds an action — never written at runtime from user input, so a
-- role can only ever be granted a permission that already exists here.
create table public.permissions (
  key           text primary key
                check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),

  -- Grouping for the role-builder UI: 'hotels', 'agencies', 'finance', ...
  module        text not null,

  name_ar       text not null,
  name_en       text not null,
  description_ar text,
  description_en text,

  -- Ordering within a module on the role-builder screen.
  sort_order    integer not null default 0,

  created_at    timestamptz not null default now()
);

comment on table public.permissions is
  'Named permission keys grouped by module, not a CRUD matrix (CLAUDE.md §15, decision 1.6).';

create index permissions_module_idx on public.permissions (module, sort_order);

-- ---------------------------------------------------------- role_permissions

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,

  granted_at    timestamptz not null default now(),
  -- Nullable: rows created by the seed migration have no granting user.
  granted_by    uuid references auth.users (id) on delete set null,

  primary key (role_id, permission_key)
);

create index role_permissions_permission_idx on public.role_permissions (permission_key);

-- ------------------------------------------------------------------ agencies

create table public.agencies (
  id                uuid primary key default gen_random_uuid(),

  -- Human-facing reference shown on bookings and invoices (LLT-A-000123).
  code              text not null unique,

  name              text not null check (length(btrim(name)) between 2 and 200),
  -- Registered legal name, when it differs from the trading name.
  legal_name        text,

  email             text not null check (position('@' in email) > 1),
  phone             text,
  website           text,

  country_code      char(2) not null,
  city              text,
  address           text,

  -- Commercial registration / tax identifiers, needed on invoices (Phase 5).
  commercial_reg_no text,
  tax_id            text,

  logo_url          text,

  status            public.agency_status not null default 'pending',

  -- Credit account (CLAUDE.md §10). The *balance* is deliberately not a column:
  -- it is derived from the payments ledger built in Phase 5, so that no code
  -- path can move an agent's balance without leaving an auditable row.
  credit_limit      numeric(14, 2) not null default 0 check (credit_limit >= 0),
  currency_code     char(3) not null default 'EGP',

  -- Approval trail.
  approved_at       timestamptz,
  approved_by       uuid references auth.users (id) on delete set null,
  rejected_at       timestamptz,
  rejected_by       uuid references auth.users (id) on delete set null,
  rejection_reason  text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.agencies.credit_limit is
  'Ceiling only. The running balance is derived from the payments ledger (Phase 5), never stored here (CLAUDE.md §10).';

create index agencies_status_idx on public.agencies (status, created_at desc);
create index agencies_name_idx on public.agencies (lower(name));

-- Human-readable agency codes: LLT-A-000001, LLT-A-000002, ...
create sequence public.agency_code_seq start 1;

-- ------------------------------------------------------------------ profiles

-- One row per auth.users row. Holds everything about a person that is ours
-- rather than Supabase Auth's.
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,

  -- Denormalised from auth.users so admin lists can filter and sort by email
  -- without needing service-role access to the auth schema. Kept in sync by
  -- trigger on auth.users (see the functions migration).
  email           text not null,

  full_name       text not null default '',
  phone           text,
  avatar_url      text,

  role_id         uuid not null references public.roles (id) on delete restrict,

  -- Null for back-office staff; set for agent_owner / agent_user.
  agency_id       uuid references public.agencies (id) on delete cascade,

  status          public.user_status not null default 'pending',

  preferred_locale text not null default 'ar' check (preferred_locale in ('ar', 'en')),

  approved_at     timestamptz,
  approved_by     uuid references auth.users (id) on delete set null,
  suspended_at    timestamptz,
  suspension_reason text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_agency_idx on public.profiles (agency_id) where agency_id is not null;
create index profiles_role_idx on public.profiles (role_id);
create index profiles_status_idx on public.profiles (status, created_at desc);
create unique index profiles_email_key on public.profiles (lower(email));

-- ----------------------------------------------------------------- audit_log

-- Append-only trail. Phase 1 uses it for permission and status changes; later
-- phases add their own actions. No UPDATE or DELETE policy is ever written for
-- this table — an audit log that can be edited is not an audit log.
create table public.audit_log (
  id          bigint generated always as identity primary key,

  actor_id    uuid references auth.users (id) on delete set null,
  -- Kept even if the actor is later deleted, so the trail survives.
  actor_email text,

  action      text not null,
  entity_type text not null,
  entity_id   text,

  -- Before/after snapshots of only the fields that changed.
  changes     jsonb,

  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- --------------------------------------------------------- updated_at triggers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- enable RLS

-- CLAUDE.md §12: RLS on every table, no exceptions "for now".
-- With RLS enabled and no policy yet, these tables are closed to everyone
-- except the service role. Policies are added in the RLS migration.
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.agencies         enable row level security;
alter table public.profiles         enable row level security;
alter table public.audit_log        enable row level security;
